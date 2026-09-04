import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { MarketingShell } from "@/components/MarketingShell";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Recruiter organisation — TalentLoom" }] }),
  component: AuthPage,
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

function AuthPage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (isLoaded && isSignedIn) navigate({ to: "/pipeline", replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-md px-4 pt-8 pb-16 sm:pt-16">
        <div className="glass-strong rounded-3xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold">{mode === "signin" ? "Welcome back, recruiter" : "Build a better hiring experience"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Pick up where your team left off and keep great candidates moving." : "Create a calm, organised hiring experience that makes your company look as good as it is."}
          </p>

          <div className="mt-6">
            {mode === "signin" ? (
              <SignIn routing="virtual" appearance={clerkAppearance} fallbackRedirectUrl="/pipeline" />
            ) : (
              <SignUp routing="virtual" appearance={clerkAppearance} fallbackRedirectUrl="/pipeline" />
            )}
          </div>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Ready to improve your hiring flow?" : "Already have an organisation?"}{" "}
            <button className="font-medium text-teal-700 hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create my organisation" : "Open my candidate flow"}
            </button>
          </p>
          <p className="mt-6 text-center text-xs text-muted-foreground"><Link to="/" className="hover:underline">← See how TalentLoom works</Link></p>
        </div>
      </div>
    </MarketingShell>
  );
}
