// Server-only: verify Clerk session tokens and provision/link profile rows.
import { createClerkClient, verifyToken } from "@clerk/backend";

function b64urlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}


/** Verifies an HS256 JWT against the shared signing secret (WebCrypto only). */
async function verifyHs256(token: string, secret: string): Promise<Record<string, unknown>> {
  const [headerB64, payloadB64, sigB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("malformed token");

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64))) as { alg?: string };
  if (header.alg !== "HS256") throw new Error(`unexpected algorithm ${header.alg}`);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) throw new Error("signature mismatch");

  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as Record<string, unknown>;
  const exp = typeof payload["exp"] === "number" ? (payload["exp"] as number) : undefined;
  if (exp && exp * 1000 < Date.now() - 5000) throw new Error("token expired");
  return payload;
}

export async function verifyClerkToken(token: string): Promise<string> {
  const secretKey = process.env["CLERK_SECRET_KEY"];
  const supabaseJwtSecret = process.env["EXT_SUPABASE_JWT_SECRET"];

  const alg = (() => {
    try {
      return (JSON.parse(new TextDecoder().decode(b64urlToBytes(token.split(".")[0]!))) as { alg?: string }).alg;
    } catch {
      return undefined;
    }
  })();

  let payload: { sub?: string } | undefined;
  try {
    if (alg === "HS256") {
      // Shared HS256: Clerk signs the Supabase JWT template with the database JWT secret.
      if (!supabaseJwtSecret) throw new Error("Missing EXT_SUPABASE_JWT_SECRET for HS256 tokens");
      payload = (await verifyHs256(token, supabaseJwtSecret)) as { sub?: string };
    } else if (secretKey) {
      // Default Clerk signing (RS256 via Clerk JWKS).
      payload = await verifyToken(token, { secretKey });
    } else {
      throw new Error("Missing CLERK_SECRET_KEY");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[clerk] token verification failed:", detail);
    throw new Error(
      `Unauthorized: Invalid token (${alg ?? "unknown"} verification failed: ${detail})`,
    );
  }

  if (!payload?.sub) {
    throw new Error("Unauthorized: Invalid token (verified token has no subject claim)");
  }
  return payload.sub;
}



interface ProfileRow {
  id: string;
  onboarding_completed_at: string | null;
  email?: string | null;
  full_name?: string | null;
}

/**
 * Finds (or creates) the profile row for a Clerk user.
 * Existing users are linked by email on first Clerk sign-in so their
 * organisations, applications and documents carry over.
 */
export async function provisionProfileForClerkUser(clerkUserId: string): Promise<ProfileRow> {
  const { supabaseAdmin } = await import("./app-admin.server");
  const admin = supabaseAdmin as unknown as {
    from: (t: string) => any;
  };

  const { data: existing } = await admin
    .from("profiles")
    .select("id, onboarding_completed_at, email, full_name")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (existing) return existing as ProfileRow;

  const clerk = createClerkClient({ secretKey: process.env["CLERK_SECRET_KEY"]! });
  const cu = await clerk.users.getUser(clerkUserId);
  const email =
    cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress ??
    null;
  const fullName = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || null;

  // Link an existing profile (created before the Clerk migration) by email.
  if (email) {
    const { data: byEmail } = await admin
      .from("profiles")
      .select("id, onboarding_completed_at, email, full_name")
      .ilike("email", email)
      .is("clerk_user_id", null)
      .maybeSingle();
    if (byEmail) {
      await admin
        .from("profiles")
        .update({ clerk_user_id: clerkUserId, avatar_url: cu.imageUrl ?? undefined })
        .eq("id", byEmail.id);
      return byEmail as ProfileRow;
    }
  }

  const { data: created, error } = await admin
    .from("profiles")
    .insert({
      id: crypto.randomUUID(),
      clerk_user_id: clerkUserId,
      email,
      full_name: fullName,
      avatar_url: cu.imageUrl ?? null,
      onboarding_step: 1,
    })
    .select("id, onboarding_completed_at, email, full_name")
    .single();
  if (error) throw error;
  return created as ProfileRow;
}
