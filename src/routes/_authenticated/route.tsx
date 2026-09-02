import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

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
