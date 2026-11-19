import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { MarketingShell } from "@/components/MarketingShell";
import { safeReturnPath } from "@/lib/safe-return-path";

export const Route = createFileRoute("/candidate/auth")({
  head: () => ({
    meta: [
      { title: "Your candidate space — Talentloom" },
      {
        name: "description",
        content:
          "Keep your applications and documents in one place, so your next application takes minutes, not hours.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  // Where to go after signing in (e.g. back to the job board); paths on this site only.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    // Always set, so a rejected value can't pass through from the URL.
    redirect: safeReturnPath(search["redirect"]),
  }),
  component: CandidateAuthPage,
});

const clerkAppearance = {
  variables: {
    colorPrimary: "#34ca94",
    colorText: "#4A3A55",
    borderRadius: "0.9rem",
    fontFamily: "Rubik, sans-serif",
  },
  elements: {
    card: "shadow-none bg-transparent",
    formButtonPrimary: "btn-mint rounded-xl",
  },
} as const;

function CandidateAuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const redirect = safeReturnPath(Route.useSearch().redirect);
  const afterSignIn = redirect ?? "/candidate/applications";
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (redirect) router.history.replace(redirect);
    else navigate({ to: "/candidate/applications", replace: true });
  }, [isLoaded, isSignedIn, navigate, router, redirect]);

  return (
    <MarketingShell>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="glass-strong w-full max-w-md rounded-3xl p-4 sm:p-8">
          <h1 className="text-center font-display text-2xl font-bold">Candidate sign in</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {mode === "signin"
              ? "Pick up where you left off, track your applications, and keep your documents ready."
              : "Save your applications and documents in one place — so you can spend less time on admin and more time finding the right role."}
          </p>

          <div className="mt-6">
            {mode === "signin" ? (
              <SignIn
                routing="virtual"
                withSignUp
                appearance={clerkAppearance}
                fallbackRedirectUrl={afterSignIn}
              />
            ) : (
              <SignUp
                routing="virtual"
                appearance={clerkAppearance}
                fallbackRedirectUrl={afterSignIn}
              />
            )}
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
