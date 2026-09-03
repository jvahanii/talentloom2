import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/app-client";
import { AppShell } from "@/components/AppShell";
import { PENDING_INVITE_KEY } from "@/routes/invite.$token";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

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
    const { data: p } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!p?.onboarding_completed_at) {
      throw redirect({ to: "/onboarding" });
    }

    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return <AppShell><Outlet /></AppShell>;
}
