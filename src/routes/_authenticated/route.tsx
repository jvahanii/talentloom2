import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/app-client";
import { AppShell } from "@/components/AppShell";
import { PENDING_INVITE_KEY } from "@/routes/invite.$token";
import { getClerkToken, waitForClerk } from "@/lib/clerk";
import { isPreviewDesignMode } from "@/lib/preview-design-mode";
import { ensureMyProfile } from "@/lib/profile.functions";

const NETWORK_ERROR = /failed to fetch|networkerror|load failed|network request failed/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Calls the profile server function, retrying transient network failures. */
async function loadProfileWithRetry(attempts = 4) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await ensureMyProfile();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!NETWORK_ERROR.test(message)) throw err;
      console.warn(`[auth] ensureMyProfile network error (attempt ${i + 1}/${attempts}):`, message);
      await sleep(500 * 2 ** i);
    }
  }
  throw lastErr;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Remember where the person was going, so sign-in can bring them back.
    const back = { redirect: location.href };
    // Pulse surveys can be personal, and Settings holds the personal profile, so
    // neither needs onboarding or an organisation.
    const under = (p: string) => location.pathname === p || location.pathname.startsWith(p + "/");
    const skipsOnboarding = under("/surveys") || under("/settings");

    const clerk = await waitForClerk();
    if (!clerk?.session) {
      // Lovable editor preview: let pages render (with empty states) so visual
      // edits are possible without signing in. Never applies on the live site.
      if (isPreviewDesignMode()) return { userId: "preview-design-mode" };
      throw redirect({ to: "/auth", search: back });
    }

    // A session without a usable template token means we cannot authenticate
    // against the backend — send the user back to sign in rather than erroring.
    const token = await getClerkToken();
    if (!token) throw redirect({ to: "/auth", search: back });

    // Make sure a profile row exists for this Clerk user (creates or links it).
    let profile: Awaited<ReturnType<typeof ensureMyProfile>>;
    try {
      profile = await loadProfileWithRetry();
    } catch (err) {
      // Errors can arrive as plain objects (e.g. database errors), not Error instances.
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      console.error("[auth] ensureMyProfile failed:", message, err);
      if (/unauthorized|no authorization header|invalid token/i.test(message)) {
        throw redirect({ to: "/auth", search: back });
      }
      if (NETWORK_ERROR.test(message)) {
        throw new Error(
          "Could not reach the server to load your account. Check your connection and reload the page.",
        );
      }
      throw new Error(`Could not load your account: ${message}`);
    }

    // Accept a pending workspace invite (user clicked an invite link before signing in).
    try {
      const inviteToken = window.sessionStorage.getItem(PENDING_INVITE_KEY);
      if (inviteToken) {
        const { data: orgId, error: inviteError } = await supabase.rpc("accept_invite", {
          _token: inviteToken,
        });
        if (!inviteError && orgId) {
          window.sessionStorage.removeItem(PENDING_INVITE_KEY);
          window.localStorage.setItem("talently:current-org", orgId as string);
        }
      }
    } catch {
      /* invite issues are non-fatal */
    }

    // Enforce onboarding completion before entering the app.
    if (!profile.onboardingCompleted && !skipsOnboarding) {
      throw redirect({ to: "/onboarding" });
    }

    return { userId: profile.id };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
