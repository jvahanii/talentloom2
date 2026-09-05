import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { clerkSignOut } from "@/lib/clerk";
import { useSession } from "@/lib/auth";
import loomLogo from "@/assets/kawaii-loom-logo.png";

function HeaderActions() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  if (loading || !user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/candidate/auth" className="btn-butter rounded-xl px-4 py-2 text-sm font-medium">Opportunity seeker sign-in</Link>
        <Link to="/auth" className="btn-teal rounded-xl px-4 py-2 text-sm font-medium">Recruiter sign in</Link>
      </div>
    );
  }
  const name = (user.user_metadata?.full_name as string | undefined) || user.email || "Account";
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-card px-2 py-1 shadow-[0_2px_0_var(--brand-mint)]">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-primary bg-primary/15 text-xs font-bold text-primary">
        {initial}
      </div>
      <span className="hidden max-w-40 truncate text-xs font-medium sm:inline" title={user.email ?? undefined}>
        {name}
      </span>
      <button
        onClick={async () => {
          await clerkSignOut();
          navigate({ to: "/" });
        }}
        className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 px-4 py-3 sm:px-6">
        <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="wiggle-hover grid h-9 w-9 shrink-0 place-items-center rounded-2xl border-2 border-primary bg-accent text-accent-foreground font-bold shadow-[0_3px_0_var(--brand-bubblegum)]">
              <img src={loomLogo} alt="Talentloom logo" width={512} height={512} className="h-6 w-6" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Talentloom</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <HeaderActions />
          </div>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-sm text-muted-foreground">
        <p>Talentloom — Better hiring experiences for everyone · <Link to="/docs" className="underline hover:text-foreground">User guide</Link></p>
      </footer>
    </div>
  );
}
