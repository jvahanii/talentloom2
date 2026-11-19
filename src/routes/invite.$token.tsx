import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { getMyProfileId } from "@/lib/auth";
import { redeemInvite, type InviteResult } from "@/lib/invite";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept invite — Talentloom" },
      {
        name: "description",
        content: "Accept your invitation to join a hiring organisation on Talentloom.",
      },
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
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await getMyProfileId();
      if (cancelled) return;
      if (!uid) {
        try {
          window.sessionStorage.setItem(PENDING_INVITE_KEY, token);
        } catch {
          /* ignore */
        }
        navigate({ to: "/auth" });
        return;
      }
      setMessage("Checking your invite…");
      let result: InviteResult;
      try {
        result = await redeemInvite(token);
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : "This invite is invalid or has expired.");
        }
        return;
      }
      if (cancelled) return;
      try {
        window.sessionStorage.removeItem(PENDING_INVITE_KEY);
        if (result.joined) window.localStorage.setItem("talently:current-org", result.orgId);
      } catch {
        /* ignore */
      }
      if (!result.joined) {
        setWaiting(true);
        setMessage(
          `Your Talentloom account is ready. You haven't been added to ${result.orgName ?? "the organisation"} yet: one of its admins will add you.`,
        );
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_step")
        .eq("id", uid)
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
        <p className="text-lg font-semibold">
          {waiting ? "Account created" : "Organisation invite"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {waiting && (
          <a href="/" className="mt-4 inline-block text-sm font-medium text-primary underline">
            Back to the home page
          </a>
        )}
      </div>
    </div>
  );
}
