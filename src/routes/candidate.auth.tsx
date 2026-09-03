import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { toast } from "sonner";
import { MarketingShell } from "@/components/MarketingShell";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/candidate/auth")({
  head: () => ({
    meta: [
      { title: "Your candidate space — TalentLoom" },
      { name: "description", content: "Keep your applications and documents in one place, so your next application takes minutes, not hours." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CandidateAuthPage,
});

function CandidateAuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/candidate/applications", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/candidate/applications" },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Welcome to TalentLoom");
          navigate({ to: "/candidate/applications", replace: true });
        } else {
          toast.success("Account created — check your email to confirm.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/candidate/applications", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const magicLink = async () => {
    if (!email.trim()) {
      toast.error("Enter your email address first.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + "/candidate/applications" },
      });
      if (error) throw error;
      setMagicSent(true);
      toast.success("Sign-in link sent — check your email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the link");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/candidate/auth" },
    });
    if (error) toast.error("Google sign-in failed");
  };

  return (
    <MarketingShell>
      <div className="mx-auto max-w-md px-4 pt-8 pb-16 sm:pt-16">
        <div className="glass-strong rounded-3xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold">
            {mode === "signin" ? "Welcome back, candidate" : "Make job hunting easier"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Pick up where you left off, track your applications, and keep your documents ready." : "Save your applications and documents in one place — so you can spend less time on admin and more time finding the right role."}
          </p>

          <button
            onClick={google}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium hover:bg-white/80"
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-input bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Password (min 6 characters)" : "Password — leave empty for a magic link"}
                className="w-full rounded-xl border border-input bg-white/70 px-4 py-2.5 pr-11 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              disabled={loading}
              type="submit"
              className="btn-teal w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {loading ? "One moment…" : mode === "signin" ? "Open my applications" : "Create my free account"}
            </button>
            {mode === "signin" && (
              <button
                type="button"
                disabled={loading || magicSent}
                onClick={magicLink}
                className="w-full rounded-xl glass px-4 py-2.5 text-sm font-medium hover:bg-white/80 disabled:opacity-60"
              >
                {magicSent ? "Link sent — check your email" : "Email me a sign-in link instead"}
              </button>
            )}
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to TalentLoom?" : "Already set up?"}{" "}
            <button
              className="font-medium text-teal-700 hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create my free account" : "Open my applications"}
            </button>
          </p>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/apply" className="hover:underline">← Keep exploring roles</Link>
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
