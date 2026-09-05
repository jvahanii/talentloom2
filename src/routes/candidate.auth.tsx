import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { MarketingShell } from "@/components/MarketingShell";

export const Route = createFileRoute("/candidate/auth")({
  head: () => ({
    meta: [
      { title: "Your candidate space — Talentloom" },
      { name: "description", content: "Keep your applications and documents in one place, so your next application takes minutes, not hours." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CandidateAuthPage,
});

const clerkAppearance = {
  variables: {
    colorPrimary: "#2fbf9f",
    colorText: "#4A3A55",
    borderRadius: "0.9rem",
    fontFamily: "Rubik, sans-serif",
  },
  elements: {
    card: "shadow-none bg-transparent",
    formButtonPrimary: "btn-teal rounded-xl",
  },
} as const;

function CandidateAuthPage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate({ to: "/candidate/applications", replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <MarketingShell>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="glass-strong rounded-3xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold">Candidate sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Pick up where you left off, track your applications, and keep your documents ready." : "Save your applications and documents in one place — so you can spend less time on admin and more time finding the right role."}
          </p>

          <div className="mt-6">
            {mode === "signin" ? (
              <SignIn routing="virtual" appearance={clerkAppearance} fallbackRedirectUrl="/candidate/applications" />
            ) : (
              <SignUp routing="virtual" appearance={clerkAppearance} fallbackRedirectUrl="/candidate/applications" />
            )}
          </div>

        </div>
      </div>
    </MarketingShell>
  );
}
