import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/app-client";
import { AppShell } from "@/components/AppShell";
import { PENDING_INVITE_KEY } from "@/routes/invite.$token";
import { waitForClerk } from "@/lib/clerk";
import { ensureMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const clerk = await waitForClerk();
    if (!clerk?.session) throw redirect({ to: "/auth" });

    // Make sure a profile row exists for this Clerk user (creates or links it).
    const profile = await ensureMyProfile();

    // Accept a pending workspace invite (user clicked an invite link before signing in).
    try {
      const token = window.sessionStorage.getItem(PENDING_INVITE_KEY);
      if (token) {
        const { data: orgId, error: inviteError } = await supabase.rpc("accept_invite", { _token: token });
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
