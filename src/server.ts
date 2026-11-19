import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/** True when the failure is just the browser hanging up mid-request. */
function isClientAbort(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const err = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (err.code === "ECONNRESET" || err.code === "ECONNABORTED") return true;
    if (typeof err.message === "string" && /^aborted$/i.test(err.message)) return true;
    current = err.cause;
  }
  return false;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const captured = consumeLastCapturedError();
  // The browser hung up (navigation/reload mid-render): not an app error.
  if (isClientAbort(captured)) return new Response(null, { status: 499 });

  console.error(captured ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * What pages may load and who may frame them. Scripts come only from this
 * site and Clerk (plus Cloudflare's bot check, which Clerk's sign-up uses);
 * inline scripts stay allowed because the server streams page data in them.
 * Images may come from any https host: sign-in providers serve avatars.
 */
const SUPABASE = "https://dfnotwbswxtrpricbjek.supabase.co";
const CLERK = "https://clerk.talentloom.org";
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${CLERK} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${CLERK} ${SUPABASE} ${SUPABASE.replace("https://", "wss://")}`,
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy-Report-Only": CONTENT_SECURITY_POLICY,
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  // Invite and survey links carry their token in the path: keep it on this site.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

function withSecurityHeaders(response: Response): Response {
  // Some responses (redirects, fetched ones) have immutable headers: copy them.
  let out = response;
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  } catch {
    out = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  }
  return out;
}

async function handle(request: Request, env: unknown, ctx: unknown): Promise<Response> {
  try {
    const handler = await getServerEntry();
    const response = await handler.fetch(request, env, ctx);
    // Browser already hung up (reload/navigation): nothing to render.
    if (request.signal?.aborted && response.status >= 500) {
      return new Response(null, { status: 499 });
    }
    return await normalizeCatastrophicSsrResponse(response);
  } catch (error) {
    if (isClientAbort(error) || request.signal?.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    return withSecurityHeaders(await handle(request, env, ctx));
  },
};
