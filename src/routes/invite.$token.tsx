import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept invite — TalentLoom" },
      { name: "description", content: "Accept your invitation to join a hiring workspace on TalentLoom." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

export const PENDING_INVITE_KEY = "talently:pending-invite";

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Checking your invite…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!u.user) {
        try {
          window.sessionStorage.setItem(PENDING_INVITE_KEY, token);
        } catch {
          /* ignore */
        }
        navigate({ to: "/auth" });
        return;
      }
      setMessage("Joining workspace…");
      const { data: orgId, error } = await supabase.rpc("accept_invite", { _token: token });
      if (cancelled) return;
      if (error || !orgId) {
        setMessage(error?.message ?? "This invite is invalid or has expired.");
        return;
      }
      try {
        window.localStorage.setItem("talently:current-org", orgId as string);
        window.sessionStorage.removeItem(PENDING_INVITE_KEY);
      } catch {
        /* ignore */
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_step")
        .eq("id", u.user.id)
        .maybeSingle();
      if (cancelled) return;
      if ((profile?.onboarding_step ?? 99) >= 99) {
        navigate({ to: "/pipeline" });
      } else {
        navigate({ to: "/onboarding" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <p className="text-lg font-semibold">Workspace invite</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
