import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, UserRound } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import heroImage from "@/assets/hero-team-review.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Talently — Recruitment pipeline for teams and candidates" },
      { name: "description", content: "One shared hiring pipeline for recruiters, and a simple way for candidates to find open roles and apply." },
      { property: "og:title", content: "Talently — Recruitment pipeline for teams and candidates" },
      { property: "og:description", content: "One shared hiring pipeline for recruiters, and a simple way for candidates to find open roles and apply." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 pt-3 pb-12 sm:px-6 sm:pt-5 sm:pb-20">
        <div
          className="relative overflow-hidden rounded-3xl p-6 sm:p-12 text-center"
          style={{ backgroundImage: `url(${heroImage.url})`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          {/* Dark gradient overlay for text contrast */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, rgba(27,27,27,0.88) 0%, rgba(27,27,27,0.72) 45%, rgba(75,115,255,0.55) 100%)",
            }}
          />
          <div className="relative">
            <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Stop losing candidates in <span className="italic">spreadsheets and inboxes</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-white/80">
              Talently gives your hiring team one shared pipeline. Track every candidate, every requisition, every stage — without another SaaS bill.
            </p>
            <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
              <Link
                to="/auth"
                className="group rounded-2xl border border-white/20 bg-white/10 p-6 text-left backdrop-blur transition hover:bg-white/20"
              >
                <Briefcase className="h-7 w-7 text-white" />
                <span className="mt-4 block font-display text-lg font-semibold text-white">I'm a Recruiter</span>
                <span className="mt-1 block text-sm text-white/75">
                  Sign in to manage your pipeline, requisitions and team.
                </span>
                <span className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition group-hover:opacity-90">
                  Recruiter sign in
                </span>
              </Link>
              <Link
                to="/apply"
                className="group rounded-2xl border border-white/20 bg-white/10 p-6 text-left backdrop-blur transition hover:bg-white/20"
              >
                <UserRound className="h-7 w-7 text-white" />
                <span className="mt-4 block font-display text-lg font-semibold text-white">I'm a Candidate</span>
                <span className="mt-1 block text-sm text-white/75">
                  Browse open roles and apply with your CV — no account needed.
                </span>
                <span className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition group-hover:opacity-90">
                  Find a role
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>


      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="font-display text-3xl font-bold text-center">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { t: "1. Open a requisition", d: "Add the role, hiring manager, and target start date. Your open roles live in one place." },
            { t: "2. Move candidates through stages", d: "Applied → Screen → Interview → Offer → Hired. Drag between columns on desktop or use the stage picker on mobile." },
            { t: "3. See the funnel at a glance", d: "Analytics shows time-in-stage, conversion, and candidates by source — no dashboards to build." },
          ].map((s) => (
            <div key={s.t} className="glass rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="font-display text-3xl font-bold text-center">Frequently asked</h2>
        <div className="glass mt-8 rounded-2xl p-2 sm:p-4">
          <Accordion type="single" collapsible>
            <AccordionItem value="a">
              <AccordionTrigger>Is my data shared with other users?</AccordionTrigger>
              <AccordionContent>No. Every account has its own private workspace. Row-level security scopes every candidate and requisition to your user only.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Do you integrate with LinkedIn or job boards?</AccordionTrigger>
              <AccordionContent>Not yet — this is a template. The Settings page has a "Connect your tools" section marked coming soon; import via CSV works today.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
              <AccordionTrigger>Can I remix this template?</AccordionTrigger>
              <AccordionContent>Yes. Schema, RLS, auth, and sample seeds carry over on remix. Your candidate data does not — see the Docs page for details.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="d" className="border-b-0">
              <AccordionTrigger>What sign-in methods are supported?</AccordionTrigger>
              <AccordionContent>Email + password and Continue with Google.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </MarketingShell>
  );
}
