import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Link2, Merge, Network, Sparkles, UserRound } from "lucide-react";
import { skillLevelColor, type SkillLevel } from "@/lib/skills";
import { MarketingShell } from "@/components/MarketingShell";
import { supabase } from "@/integrations/supabase/app-client";
import { useSession } from "@/lib/auth";
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
  const { user } = useSession();
  const profileId = user?.id ?? null;
  // Access rules return only the organisations this person can open.
  const { data: orgCount, isLoading: orgsLoading } = useQuery({
    queryKey: ["home-org-count", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("organizations")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const hasOrganisation = Boolean(profileId) && (orgCount ?? 0) > 0;

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
              PeopleOps for the People
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg text-white/80">
              A faster, cleaner and free way foster adaptiveness by multilearning, conducting satisfaction surveys, and matching people to new opportunities.  
            </p>
            <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
              <Link
                {...(hasOrganisation
                  ? { to: "/pipeline" as const }
                  : { to: "/auth" as const, search: { mode: "signup" as const } })}
                className="group rounded-2xl border border-white/20 bg-white/10 p-6 text-left backdrop-blur transition hover:bg-white/20"
              >
                <Briefcase className="h-7 w-7 text-white" />
                <span className="mt-4 block font-display text-lg font-semibold text-white">
                  Hiring &amp; Multilearning
                </span>
                <span className="mt-1 block text-sm text-white/75">
                  Give candidates a standout hiring experience  Foster your organization's
                  adaptiveness through multilearning and organziational transfer of learning
                </span>
                <span
                  className={`mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition group-hover:opacity-90 ${orgsLoading ? "invisible" : ""}`}
                >
                  {hasOrganisation ? "Go to my organisation" : "Create organisation"}
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

      <SkillsShowcase hasOrganisation={hasOrganisation} loading={orgsLoading} />

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Link
          to="/pulse"
          className="group block rounded-3xl p-1.5 transition hover:-translate-y-0.5"
          style={{ background: "linear-gradient(120deg, #bdf5e0, #ffe9a8 45%, #ff9ec7)" }}
        >
          <div className="glass flex flex-col items-start gap-4 rounded-[1.4rem] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">
                Surveys
              </span>
              <h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">Talentloom Pulse</h2>
              <p className="text-soft mt-1 text-sm sm:text-base">
                Run longitudinal surveys and structured interviews to gauge the well-being of your employees and assess other surveyable issues.
              </p>
            </div>
            <span className="btn-mint shrink-0 rounded-xl px-5 py-2.5 text-sm font-medium">
              Explore Pulse→
            </span>
          </div>
        </Link>
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
            <AccordionItem value="skills">
              <AccordionTrigger>Who can see my skills?</AccordionTrigger>
              <AccordionContent>
                The people in the organisations you belong to. You add and level your own skills; in
                each organisation, only people whose title lets them manage others can change them
                for you.
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

const SKILL_FEATURES = [
  {
    icon: Sparkles,
    t: "Map who knows what",
    d: "Everyone lists their skills with a level from Novice to Master — in your organisation's own words. See every skill in one place, colour-coded by level.",
  },
  {
    icon: Link2,
    t: "Learn together",
            d: "Drag one name onto another to pair people up to teach and learn a skill. The one who knows it best and the one who wants to grow, side by side.",
  },
  {
    icon: Network,
    t: "Teams that know their strengths",
    d: "See at a glance which skills each team possesses, and how deep they go.",
  },
  {
    icon: Merge,
    t: "A skill list that stays tidy",
    d: "Existing skills are suggested as you type, and look-alikes such as Workshop and Workshops, or Ratsastaminen and Ratsastus, are offered for merging.",
  },
];

/** A small skill card as it looks in the app: who has the skill, at what level, and who learns together. */
const SAMPLE: { name: string; level: SkillLevel; pair?: number }[] = [
  { name: "Aino", level: 4, pair: 1 },
  { name: "Mikko", level: 3 },
  { name: "Sara", level: 2, pair: 1 },
  { name: "Leo", level: 1 },
];
const SAMPLE_LEVELS = ["", "Novice", "Basic", "Advanced", "Master"];

function SkillsShowcase({
  hasOrganisation,
  loading,
}: {
  hasOrganisation: boolean;
  loading: boolean;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <div className="glass rounded-3xl p-6 sm:p-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">
              Skills &amp; multilearning
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold">See and spread what your people know.</h2>
            <p className="text-soft mt-3 max-w-xl text-sm sm:text-base">
              Talentloom turns the know-how scattered across your organisation into something you
              can see and grow: who has which skill, how well, and who could - and should - learn it from whom. Fostering the creation of multi-skilled people and teams is the basis for true agility!
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                {...(hasOrganisation
                  ? { to: "/skills" as const }
                  : { to: "/auth" as const, search: { mode: "signup" as const } })}
                className={`btn-teal rounded-xl px-5 py-2.5 text-sm font-semibold ${loading ? "invisible" : ""}`}
              >
                {hasOrganisation ? "Open Skills" : "Start mapping skills"}
              </Link>
              <Link
                to="/docs"
                hash="skills"
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                How skills work →
              </Link>
            </div>
          </div>

          <div
            className="rounded-2xl border-2 border-border bg-card p-4 shadow-[0_4px_0_var(--brand-mint)]"
            aria-label="Example of a skill card"
          >
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">Facilitation</p>
              <span className="text-xs text-muted-foreground">4 people</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {SAMPLE.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1">
                    {p.name}
                    {p.pair && (
                      <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                        {p.pair}
                      </span>
                    )}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${skillLevelColor(p.level)}`}
                  >
                    {SAMPLE_LEVELS[p.level]}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t-2 border-dashed border-border pt-3 text-xs">
              <p className="font-semibold text-muted-foreground">Learning with</p>
              <p className="mt-1 flex items-center gap-1">
                <span className="rounded-full bg-primary/15 px-1.5 font-semibold text-primary">
                  1
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5">Aino</span>
                <span className="rounded-full bg-secondary px-2 py-0.5">Sara</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SKILL_FEATURES.map((f) => (
            <div key={f.t} className="rounded-2xl border-2 border-border bg-card/70 p-5">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="font-display mt-3 font-semibold">{f.t}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
