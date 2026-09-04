import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/app-client";
import { AppShell } from "@/components/AppShell";
import { PENDING_INVITE_KEY } from "@/routes/invite.$token";
import { getClerkToken, waitForClerk } from "@/lib/clerk";
import { ensureMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const clerk = await waitForClerk();
    if (!clerk?.session) throw redirect({ to: "/auth" });

    // A session without a usable template token means we cannot authenticate
    // against the backend — send the user back to sign in rather than erroring.
    const token = await getClerkToken();
    if (!token) throw redirect({ to: "/auth" });

    // Make sure a profile row exists for this Clerk user (creates or links it).
    let profile: Awaited<ReturnType<typeof ensureMyProfile>>;
    try {
      profile = await ensureMyProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auth] ensureMyProfile failed:", message, err);
      if (/unauthorized|no authorization header|invalid token/i.test(message)) {
        throw redirect({ to: "/auth" });
      }
      throw new Error(`Could not load your account: ${message}`);
    }

    // Accept a pending workspace invite (user clicked an invite link before signing in).
    try {
      const inviteToken = window.sessionStorage.getItem(PENDING_INVITE_KEY);
      if (inviteToken) {
        const { data: orgId, error: inviteError } = await supabase.rpc("accept_invite", { _token: inviteToken });
        if (!inviteError && orgId) {
          window.sessionStorage.removeItem(PENDING_INVITE_KEY);
          window.localStorage.setItem("talently:current-org", orgId as string);
        }
      }
    } catch {
      /* invite issues are non-fatal */
    }

    // Enforce onboarding completion before entering the app.
    if (!profile.onboardingCompleted) {
      throw redirect({ to: "/onboarding" });
    }

    return { userId: profile.id };
  },
  component: AuthedLayout,
});


function AuthedLayout() {
  return <AppShell><Outlet /></AppShell>;
}
