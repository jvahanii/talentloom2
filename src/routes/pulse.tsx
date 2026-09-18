import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  ClipboardList,
  Heart,
  MessagesSquare,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import loomLogo from "@/assets/kawaii-loom-logo.png";
import pulseHero from "@/assets/pulse-hero.png";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: "Talentloom Pulse — Longitudinal surveys & structured interviews, free" },
      {
        name: "description",
        content:
          "Talentloom Pulse is a free solution for running longitudinal surveys and structured interviews. Follow how people change over time with repeating survey waves and consistent interview kits.",
      },
      {
        property: "og:title",
        content: "Talentloom Pulse — Longitudinal surveys & structured interviews, free",
      },
      {
        property: "og:description",
        content:
          "Run longitudinal surveys and structured interviews for free. Track how people really change over time — one wave at a time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PulseLanding,
});

function PulseHeader() {
  return (
    <header className="sticky top-0 z-40 px-4 py-3 sm:px-6">
      <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="wiggle-hover grid h-9 w-9 shrink-0 place-items-center rounded-2xl border-2 border-primary bg-white text-accent-foreground font-bold shadow-[0_3px_0_var(--brand-sky)]">
            <img src={loomLogo} alt="Talentloom logo" width={512} height={512} className="h-6 w-6" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Talentloom Pulse</span>
          <span className="sparkle hidden rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary sm:inline-block">
            free
          </span>
        </div>
        <Link
          to="/"
          className="btn-light flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Talentloom
        </Link>
      </nav>
    </header>
  );
}

function PulseLanding() {
  return (
    <div className="min-h-screen">
      <PulseHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-3 pb-12 sm:px-6 sm:pt-5 sm:pb-20">
          <div className="glass-strong pop-in overflow-hidden">
            <div className="grid items-center gap-6 p-6 sm:p-12 lg:grid-cols-2">
              <div>
                <span className="sparkle inline-block rounded-full border-2 border-primary bg-secondary px-4 py-1.5 text-xs font-bold uppercase tracking-wide">
                  Free forever
                </span>
                <h1 className="font-display mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
                  Hear how people <span className="text-duotone">really change</span>
                </h1>
                <p className="text-soft mt-5 text-base sm:text-lg">
                  Talentloom Pulse is a free solution for running longitudinal surveys and
                  structured interviews. Check in with the same people again and again, ask the
                  same questions the same way, and watch the story unfold wave by wave.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <a
                    href="#how-it-works"
                    className="btn-mint rounded-xl px-6 py-3 text-sm font-medium"
                  >
                    See how it works
                  </a>
                  <Link to="/" className="btn-light rounded-xl px-6 py-3 text-sm font-medium">
                    Back to Talentloom
                  </Link>
                </div>
                <p className="text-soft mt-4 flex items-center gap-1.5 text-xs">
                  <Heart className="h-3.5 w-3.5 text-primary" />
                  Included free with every Talentloom account.
                </p>
              </div>
              <div className="bob">
                <img
                  src={pulseHero}
                  alt="A kawaii clipboard running a survey with a heartbeat pulse line"
                  className="w-full rounded-3xl border-2 border-border"
                  width={1536}
                  height={1024}
                />
              </div>
            </div>
          </div>
        </section>

        {/* What you can run */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="font-display text-3xl font-bold text-center">
            Two tools. One gentle rhythm.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="glass p-6">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border-2 border-primary bg-secondary">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display mt-4 text-lg font-semibold">Longitudinal surveys</h3>
              <p className="text-soft mt-2 text-sm">
                Send the same survey in repeating waves — monthly, quarterly, or on your own
                schedule — and compare answers side by side to see real change, not snapshots.
              </p>
            </div>
            <div className="glass p-6">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border-2 border-primary bg-muted">
                <MessagesSquare className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display mt-4 text-lg font-semibold">Structured interviews</h3>
              <p className="text-soft mt-2 text-sm">
                Run every conversation from a consistent question kit with the same order and
                scoring, so answers stay comparable across people and across time.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="font-display text-3xl font-bold text-center">
            Your pulse check in three beats
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Users,
                t: "1. Invite your people",
                d: "Add the group you want to follow — a team, a cohort, a study panel — once.",
              },
              {
                icon: Activity,
                t: "2. Send each wave",
                d: "Launch a survey wave or schedule structured interviews. Everyone gets the same questions.",
              },
              {
                icon: TrendingUp,
                t: "3. Watch the trend",
                d: "Pulse lines up every wave so you can see what moved, what held steady, and what needs care.",
              },
            ].map((s) => (
              <div key={s.t} className="glass p-6">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border-2 border-primary bg-secondary">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-display mt-4 text-lg font-semibold">{s.t}</h3>
                <p className="text-soft mt-2 text-sm">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Free banner */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="candy-stripes rounded-3xl p-1.5">
            <div className="rounded-[1.4rem] bg-card p-6 text-center sm:p-10">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                Free. Yes, actually free.
              </h2>
              <p className="text-soft mx-auto mt-3 max-w-xl text-sm sm:text-base">
                Pulse is part of Talentloom, and it costs nothing to run longitudinal surveys and
                structured interviews for your team, class, or study.
              </p>
              <Link to="/" className="btn-pink mt-6 inline-block rounded-xl px-6 py-3 text-sm font-medium">
                Explore Talentloom
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 className="font-display text-3xl font-bold text-center">Good questions. Straight answers.</h2>
          <div className="glass mt-8 rounded-2xl p-2 sm:p-4">
            <Accordion type="single" collapsible>
              <AccordionItem value="a">
                <AccordionTrigger>What is a longitudinal survey?</AccordionTrigger>
                <AccordionContent>
                  Instead of asking once, you ask the same group the same questions over time —
                  every wave adds a new data point, so you can track how opinions, wellbeing, or
                  skills actually change.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="b">
                <AccordionTrigger>Why structured interviews?</AccordionTrigger>
                <AccordionContent>
                  When every interview follows the same questions and scoring, the differences you
                  see are about the people — not about who asked the questions or in what order.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="c">
                <AccordionTrigger>Is Talentloom Pulse really free?</AccordionTrigger>
                <AccordionContent>
                  Yes. Pulse is included free with every Talentloom account — no survey limits, no
                  per-response fees.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="d" className="border-b-0">
                <AccordionTrigger>Do I need a separate sign-in?</AccordionTrigger>
                <AccordionContent>
                  No. Pulse lives inside Talentloom — one account works for both.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl px-6 pb-10 text-center text-sm text-muted-foreground">
        <p className="flex items-center justify-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Talentloom Pulse — part of{" "}
          <Link to="/" className="underline hover:text-foreground">
            Talentloom
          </Link>
        </p>
      </footer>
    </div>
  );
}
