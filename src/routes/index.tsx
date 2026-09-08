import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, UserRound } from "lucide-react";
import { MarketingShell } from "@/components/MarketingShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import heroImage from "@/assets/kawaii-hero-illustration.svg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Talentloom — Hiring that feels better for everyone" },
      {
        name: "description",
        content:
          "A smoother way for recruiters to build a great company image and for candidates to find and apply to the right roles faster.",
      },
      { property: "og:title", content: "Talentloom — Hiring that feels better for everyone" },
      {
        property: "og:description",
        content:
          "A smoother way for recruiters to build a great company image and for candidates to find and apply to the right roles faster.",
      },
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
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[rgba(55,40,65,0.92)] via-[rgba(110,50,85,0.88)] to-[rgba(30,90,75,0.86)]" />
          <div className="relative">
            <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Hiring should feel human — for everyone
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-white/80">
              A faster, cleaner and free way to match people to new opportunities
            </p>
            <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
              <Link
                to="/auth"
                className="group rounded-2xl border border-white/20 bg-white/10 p-6 text-left backdrop-blur transition hover:bg-white/20"
              >
                <Briefcase className="h-7 w-7 text-white" />
                <span className="mt-4 block font-display text-lg font-semibold text-white">
                  We're hiring
                </span>
                <span className="mt-1 block text-sm text-white/75">
                  Give candidates a standout experience while keeping all positions and processes
                  flowing
                </span>
                <span className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition group-hover:opacity-90">
                  Create organization
                </span>
              </Link>
              <Link
                to="/apply"
                className="group rounded-2xl border border-white/20 bg-white/10 p-6 text-left backdrop-blur transition hover:bg-white/20"
              >
                <UserRound className="h-7 w-7 text-white" />
                <span className="mt-4 block font-display text-lg font-semibold text-white">
                  I’m looking for work
                </span>
                <span className="mt-1 block text-sm text-white/75">
                  Find roles worth your time, apply in minutes, and keep your potential positions,
                  applications and documents organized.
                </span>
                <span className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition group-hover:opacity-90">
                  Explore open roles
                </span>
              </Link>
              <div className="-mt-2 text-center">
                <Link
                  to="/candidate/auth"
                  className="text-xs text-white/80 underline-offset-2 hover:underline"
                ></Link>
              </div>
            </div>
            <Link
              to="/docs"
              className="mt-5 inline-block text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white"
            >
              Read the public user guide →
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="font-display text-3xl font-bold text-center">
          Less busywork. Better hiring.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: "1. Make the opportunities clear",
              d: "Publish the roles and their details across one or more organizations you are managing.",
            },
            {
              t: "2. Keep every candidate moving",
              d: "See every application at a glance, share updates with your team, and make sure great people don’t disappear into a spreadsheet.",
            },
            {
              t: "3. Organized opportunity seeking",
              d: "Find opportunities across many hiring organizations and keep your potential jobs and applications organized ",
            },
          ].map((s) => (
            <div key={s.t} className="glass rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="font-display text-3xl font-bold text-center">
          Good questions. Straight answers.
        </h2>
        <div className="glass mt-8 rounded-2xl p-2 sm:p-4">
          <Accordion type="single" collapsible>
            <AccordionItem value="a">
              <AccordionTrigger>Is my data shared with other organizations?</AccordionTrigger>
              <AccordionContent>
                Each organization is isolated from other organizations, but a person on the hiring
                side can belong to multiple organizations.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Do you integrate with LinkedIn or job boards?</AccordionTrigger>
              <AccordionContent>Not yet. Import via CSV works today.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
              <AccordionTrigger>Can I remix this app?</AccordionTrigger>
              <AccordionContent>
                Yes. Schema, RLS, auth, and sample seeds carry over on remix. Your candidate data
                does not — see the Docs page for details.
              </AccordionContent>
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
