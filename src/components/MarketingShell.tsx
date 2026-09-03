import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 px-4 py-3 sm:px-6">
        <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="wiggle-hover grid h-9 w-9 shrink-0 place-items-center rounded-2xl border-2 border-primary bg-accent text-accent-foreground font-bold shadow-[0_3px_0_var(--brand-bubblegum)]">
              ˘ᴗ˘
            </div>
            <span className="font-display text-lg font-bold tracking-tight">TalentLoom</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link to="/apply" className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Positions</Link>
            <Link to="/candidate/auth" className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Candidates</Link>
            <Link to="/docs" className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Docs</Link>
            <Link to="/auth" className="btn-teal rounded-xl px-4 py-2 text-sm font-medium">Sign in</Link>
          </div>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-sm text-muted-foreground">
        <p>TalentLoom — Recruiting pipeline template · <Link to="/docs" className="underline hover:text-foreground">Docs</Link></p>
      </footer>
    </div>
  );
}
