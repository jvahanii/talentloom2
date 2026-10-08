import { createFileRoute, useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";
import { MarketingShell } from "@/components/MarketingShell";
import { getClerkToken } from "@/lib/clerk";
import { PENDING_INVITE_KEY } from "@/routes/invite.$token";
import { ACCOUNT_TYPE_KEY, CREATE_ORG_INTENT_KEY } from "@/routes/onboarding";
import { getSignInDestination } from "@/lib/profile.functions";

async function waitForBackendToken(maxMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await getClerkToken()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => {
    const out: { mode?: "signup"; redirect?: string } = {};
    if (search.mode === "signup") out.mode = "signup";
    // Only same-site paths, so the link can't send people to another site.
    if (
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
    ) {
      out.redirect = search.redirect;
    }
    return out;
  },
  head: () => ({ meta: [{ title: "Sign in — Talentloom" }] }),
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
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { mode: searchMode, redirect: redirectTo } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(searchMode === "signup" ? "signup" : "signin");
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    if (searchMode !== "signup") return;
    // Arriving from the landing page's "Create organisation" button: after the
    // account exists, onboarding should open straight on naming the organisation.
    try {
      window.localStorage.setItem(CREATE_ORG_INTENT_KEY, "1");
      window.localStorage.setItem(ACCOUNT_TYPE_KEY, "recruiter");
    } catch {
      /* ignore */
    }
  }, [searchMode]);


  useEffect(() => {
    try {
      setInvited(Boolean(window.sessionStorage.getItem(PENDING_INVITE_KEY)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!(isLoaded && isSignedIn)) return;
    let cancelled = false;
    void (async () => {
      await waitForBackendToken();
      if (cancelled) return;
      await router.invalidate();
      if (cancelled) return;
      // One sign-in for everyone: invites and new organisations go to the recruiter
      // app; otherwise the server picks an organisation, Pulse surveys or open roles.
      let to: "/pipeline" | "/surveys" | "/apply" = "/pipeline";
      let joiningOrCreating = false;
      try {
        joiningOrCreating =
          Boolean(window.sessionStorage.getItem(PENDING_INVITE_KEY)) ||
          window.localStorage.getItem(CREATE_ORG_INTENT_KEY) === "1";
      } catch {
        /* ignore */
      }
      if (!joiningOrCreating && redirectTo) {
        // Back to the page that asked them to sign in (e.g. Pulse surveys).
        window.location.replace(redirectTo);
        return;
      }
      if (!joiningOrCreating) {
        try {
          to = (await getSignInDestination()).to;
        } catch {
          /* fall back to the recruiter app, which handles onboarding */
        }
      }
      if (cancelled) return;
      navigate({ to, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, navigate, router, redirectTo]);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-md px-4 pt-8 pb-16 sm:pt-16">
        <div className="glass-strong rounded-3xl p-4 sm:p-8">
          <h1 className="text-center font-display text-2xl font-bold">
            {invited
              ? "You've been invited"
              : mode === "signin"
                ? "Sign in to Talentloom"
                : "Build a better hiring experience"}
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {invited
              ? "Enter your email to sign in, or to create your account if you're new to Talentloom."
              : mode === "signin"
                ? "For recruiters and candidates alike. New here? Enter your email and we'll create your account."
                : "Create a calm, organised hiring experience that makes your company look as good as it is."}
          </p>

          <div className="mt-6">
            {mode === "signin" ? (
              <SignIn
                routing="virtual"
                withSignUp
                appearance={clerkAppearance}
                fallbackRedirectUrl="/pipeline"
              />
            ) : (
              <SignUp
                routing="virtual"
                appearance={clerkAppearance}
                fallbackRedirectUrl="/pipeline"
              />
            )}
          </div>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Hiring?" : "Already have an account?"}{" "}
            <button
              className="font-medium text-teal-700 hover:underline"
              onClick={() => {
                const next = mode === "signin" ? "signup" : "signin";
                // Signing up here means creating an organisation: after the account
                // exists, onboarding opens straight on naming it.
                try {
                  if (next === "signup") {
                    window.localStorage.setItem(CREATE_ORG_INTENT_KEY, "1");
                    window.localStorage.setItem(ACCOUNT_TYPE_KEY, "recruiter");
                  } else {
                    window.localStorage.removeItem(CREATE_ORG_INTENT_KEY);
                  }
                } catch {
                  /* ignore */
                }
                setMode(next);
              }}
            >
              {mode === "signin" ? "Create an organisation" : "Sign in"}
            </button>
          </p>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">
              ← See how Talentloom works
            </Link>
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
