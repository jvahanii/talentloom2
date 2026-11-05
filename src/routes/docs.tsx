import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { toast } from "sonner";
import loomLogo from "@/assets/kawaii-loom-logo.png";
import {
  Search,
  FileText,
  Send,
  UserRound,
  FolderHeart,
  Building2,
  KanbanSquare,
  BarChart3,
  Download,
  Settings2,
  Sparkles,
  ShieldCheck,
  Smartphone,
  Clock3,
  LogIn,
  Mail,
  Users,
  KeyRound,
  Trash2,
  Star,
  Activity,
  ListChecks,
  Repeat,
  Link2,
  History,
  Lock,
  Copy,
  Upload,
  Mic,
  EyeOff,
  Inbox,
  Layers,
  Network,
  Merge,
  Palette,
  Plus,
  RefreshCw,
  Hash,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Talentloom user guide" },
      {
        name: "description",
        content:
          "Learn how to find roles, run your hiring organisation, and follow people over time with Talentloom Pulse surveys.",
      },
    ],
  }),
  component: Docs,
});

type Step = { icon: LucideIcon; text: React.ReactNode };

function StepList({ steps, delay = 0 }: { steps: Step[]; delay?: number }) {
  return (
    <ol className="mt-4 grid gap-2.5">
      {steps.map((s, i) => (
        <li
          key={i}
          className="pop-in flex items-start gap-3 rounded-2xl border-2 border-border bg-secondary/60 px-4 py-3 text-sm"
          style={{ animationDelay: `${delay + i * 0.05}s` }}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-primary bg-accent text-accent-foreground shadow-[0_2px_0_var(--brand-bubblegum)]">
            <s.icon className="h-4 w-4" />
          </span>
          <span className="pt-1 leading-relaxed">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** A "#" next to a heading: links to it, and copies the full address when clicked. */
function AnchorLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`#${id}`}
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}#${id}`;
        void navigator.clipboard?.writeText(url).then(
          () => toast.success("Link copied"),
          () => undefined,
        );
      }}
      className="shrink-0 rounded-md p-1 text-muted-foreground opacity-60 hover:bg-secondary hover:text-primary hover:opacity-100 focus-visible:opacity-100"
      aria-label={`Link to ${label}`}
      title="Copy a link to this part of the guide"
    >
      <Hash className="h-4 w-4" />
    </a>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  blurb,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="glass pop-in scroll-mt-24 rounded-3xl p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="wiggle-hover grid h-11 w-11 shrink-0 place-items-center rounded-2xl border-2 border-primary bg-muted text-brand-berry shadow-[0_3px_0_var(--brand-mint)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>
        <AnchorLink id={id} label={title} />
      </div>
      {children}
    </section>
  );
}

/** A titled group of steps inside a section; with an id it can be linked to. */
function Topic({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="mt-6 scroll-mt-24">
      <div className="flex items-center gap-1">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {id && <AnchorLink id={id} label={title} />}
      </div>
      {children}
    </div>
  );
}

function Fact({ icon: Icon, text }: { icon: LucideIcon; text: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm shadow-[0_3px_0_var(--brand-mint)]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-butter/70 text-brand-ink">
        <Icon className="h-4 w-4" />
      </span>
      <span className="pt-1 leading-relaxed">{text}</span>
    </li>
  );
}

const CONTENTS = [
  { id: "getting-started", label: "Getting started" },
  { id: "candidates", label: "For candidates" },
  { id: "recruiting", label: "For recruiting teams" },
  { id: "organisations", label: "Organisations & people" },
  { id: "teams", label: "Teams" },
  { id: "skills", label: "Skills" },
  { id: "learning", label: "Learning together" },
  { id: "pulse", label: "Talentloom Pulse" },
  { id: "settings", label: "Settings" },
  { id: "good-to-know", label: "Good to know" },
];

function Docs() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <header className="glass-strong pop-in relative overflow-hidden rounded-3xl p-8 text-center sm:p-10">
          <div className="candy-stripes absolute inset-x-0 top-0 h-3" />
          <div className="bob mx-auto grid h-16 w-16 place-items-center rounded-3xl border-2 border-primary bg-accent shadow-[0_4px_0_var(--brand-bubblegum)]">
            <img
              src={loomLogo}
              alt="Talentloom loom mascot"
              width={512}
              height={512}
              loading="lazy"
              className="h-11 w-11"
            />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
            Talentloom <span className="text-duotone">user guide</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Everything you need to find a role, run a clear hiring process, or follow how people
            feel over time with Pulse — explained step by step.
          </p>
          <nav aria-label="Contents" className="mt-6 flex flex-wrap justify-center gap-2">
            {CONTENTS.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                className="rounded-full border-2 border-border bg-card px-3 py-1 text-xs font-medium hover:border-primary"
              >
                {c.label}
              </a>
            ))}
          </nav>
        </header>

        <div className="mt-8 grid gap-6">
          <Section
            id="getting-started"
            icon={LogIn}
            title="Getting started"
            blurb="One sign-in for everyone."
          >
            <StepList
              steps={[
                {
                  icon: LogIn,
                  text: (
                    <>
                      Select <strong>Sign in</strong> and enter your email, or continue with Google.
                      We email you a code to confirm it's you — there is no password. If the email
                      is new, your account is created on the spot.
                    </>
                  ),
                },
                {
                  icon: Building2,
                  text: (
                    <>
                      Hiring? Select <strong>Create organisation</strong> on the home page. After
                      your account is created you name your organisation and become its owner.
                    </>
                  ),
                },
                {
                  icon: Mail,
                  text: (
                    <>
                      Invited to a team? Open the link in your invitation and sign in with the email
                      it was sent to. You join that organisation directly.
                    </>
                  ),
                },
                {
                  icon: UserRound,
                  text: (
                    <>
                      After signing in you land where you belong: the organisation you last used, if
                      you're in one; otherwise your Pulse surveys, if you have any; otherwise the
                      job board to explore open roles. Brand-new accounts are first asked whether
                      they're a recruiter or a candidate.
                    </>
                  ),
                },
                {
                  icon: Activity,
                  text: (
                    <>
                      You don't need an organisation to use <a href="#pulse">Pulse surveys</a>.
                      Without one, the menu shows only Pulse surveys and Settings, plus a link to
                      create an organisation when you want one.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="candidates"
            icon={Search}
            title="For candidates"
            blurb="From browsing to landing the role."
          >
            <StepList
              steps={[
                {
                  icon: Search,
                  text: (
                    <>
                      Select <strong>Explore open roles</strong> to browse public positions. Search
                      by title, department, or company, filter by organisation, and sort the
                      results.
                    </>
                  ),
                },
                {
                  icon: FileText,
                  text: (
                    <>
                      Open a position to read its description, dates, and hiring manager, then
                      select <strong>Apply for this position</strong>.
                    </>
                  ),
                },
                {
                  icon: Send,
                  text: (
                    <>
                      Submit an application with your contact details and optional CV or cover
                      letter. You can apply without an account.
                    </>
                  ),
                },
                {
                  icon: UserRound,
                  text: (
                    <>
                      Sign in to connect your past applications (matched by email) and follow the
                      stage of each one in <strong>My applications</strong>.
                    </>
                  ),
                },
                {
                  icon: Star,
                  text: (
                    <>
                      When signed in, rate positions on the job board, sort by your ratings, and
                      discard the ones you're not interested in.
                    </>
                  ),
                },
                {
                  icon: FolderHeart,
                  text: (
                    <>
                      Use <strong>My documents</strong> to upload, label, rename, download, or
                      delete reusable CVs and cover letters.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="recruiting"
            icon={KanbanSquare}
            title="For recruiting teams"
            blurb="One shared candidate flow for your whole team."
          >
            <StepList
              steps={[
                {
                  icon: Building2,
                  text: (
                    <>
                      Set up in three short steps: choose <strong>Recruiter</strong>, name your
                      organisation, then bring in data — start with sample data, import candidates
                      from CSV, or skip and start empty.
                    </>
                  ),
                },
                {
                  icon: FileText,
                  text: (
                    <>
                      Create <strong>Positions</strong> with a department, hiring manager, status,
                      start date, application deadline, a link, public description, internal notes,
                      and attachments.
                    </>
                  ),
                },
                {
                  icon: KanbanSquare,
                  text: (
                    <>
                      Use the <strong>Candidate flow</strong> board to filter candidates by position
                      or source, add candidates, and move them through Applied, Screen, Interview,
                      Offer, Hired, and Rejected.
                    </>
                  ),
                },
                {
                  icon: UserRound,
                  text: (
                    <>
                      Open a candidate to edit their contact details, position, source, stage,
                      rating, notes, and resume link. Upload or replace a CV and cover letter,
                      review stage history, or delete the record when your title allows it.
                    </>
                  ),
                },
                {
                  icon: Search,
                  text: (
                    <>
                      Use <strong>Candidates</strong> to search everyone in the organisation by
                      name, email, or position.
                    </>
                  ),
                },
                {
                  icon: BarChart3,
                  text: (
                    <>
                      Review <strong>Analytics</strong> for open positions, candidate totals, hires,
                      conversion, flow stages, source mix, and average time in stage.
                    </>
                  ),
                },
                {
                  icon: Download,
                  text: (
                    <>
                      Use <strong>Export</strong> to download candidate or position CSVs, and{" "}
                      <strong>Import</strong> to preview, map, and upload candidate CSV data.
                      Download the import template for the supported columns.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="organisations"
            icon={Users}
            title="Organisations & people"
            blurb="Who is in, and what each person can do."
          >
            <StepList
              steps={[
                {
                  icon: Building2,
                  text: (
                    <>
                      Candidates, positions and the candidate flow live inside an organisation. You
                      can belong to several: switch between them, or create another, from the
                      organisation menu at the top right.
                    </>
                  ),
                },
                {
                  icon: Users,
                  text: (
                    <>
                      The <strong>People</strong> page lists everyone in the organisation: name,
                      email, when they joined, their title and <a href="#teams">teams</a>, their{" "}
                      <a href="#skills">skills</a> and who they're{" "}
                      <a href="#learning">learning with</a>. Search finds people by name, email,
                      skill or level. On a phone each person shows as a card.
                    </>
                  ),
                },
                {
                  icon: Mail,
                  text: (
                    <>
                      To bring someone in, enter their email and a title on the People page. Someone
                      who already has an account is added straight away; anyone else gets an
                      invitation email that only they can use, once. Or create an invite link anyone
                      can use — it never grants Owner, and grants Admin only when an owner makes it.
                      Invites expire after 7 days; you can email one again, copy its link, or revoke
                      it.
                    </>
                  ),
                },
                {
                  icon: KeyRound,
                  text: (
                    <>
                      Every member has a title — Owner, Admin, Member, or one you define. Under{" "}
                      <strong>Settings → Titles & permissions</strong> you decide exactly what each
                      title can do: view, edit and delete candidates and positions, invite, edit and
                      remove people, import, export, rename the organisation, and more.
                    </>
                  ),
                },
                {
                  icon: UserRound,
                  text: (
                    <>
                      You can always edit your own name and skills. Editing other people — their
                      names, titles, skills and teams — needs a title that may change titles; only
                      owners can make Owners and Admins. Anyone can leave an organisation, and an
                      organisation always keeps at least one person who can manage titles.
                    </>
                  ),
                },
                {
                  icon: Trash2,
                  text: (
                    <>
                      An owner can <strong>delete the organisation</strong> by typing its name to
                      confirm. This permanently removes its candidates, positions, history,
                      organisation surveys, teams and invites. Members keep their accounts and their
                      other organisations.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="teams"
            icon={Network}
            title="Teams"
            blurb="Who works together, and what the team knows."
          >
            <StepList
              steps={[
                {
                  icon: Network,
                  text: (
                    <>
                      The <strong>Teams</strong> page in the side menu shows the organisation's
                      teams and who is in each. A person can be in several teams; people in no team
                      are listed at the bottom.
                    </>
                  ),
                },
                {
                  icon: Plus,
                  text: (
                    <>
                      People whose title may change titles create a team with a name and an optional
                      description, rename or describe it right on its card, add people with{" "}
                      <strong>+ Add person</strong>, take them out with ×, or delete the team. Its
                      people stay in the organisation.
                    </>
                  ),
                },
                {
                  icon: Users,
                  text: (
                    <>
                      On the <strong>People</strong> page, each person's teams show under their
                      title, with <strong>+ Team</strong> and × to change them.
                    </>
                  ),
                },
                {
                  icon: Sparkles,
                  text: (
                    <>
                      Each team card lists the <strong>skills in the team</strong> — see{" "}
                      <a href="#skills-in-teams">Skills in teams</a>.
                    </>
                  ),
                },
                {
                  icon: ShieldCheck,
                  text: (
                    <>
                      Everyone in the organisation can see the teams; only titles that may change
                      titles can change them. Leaving the organisation takes a person out of its
                      teams.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section id="skills" icon={Sparkles} title="Skills" blurb="Who knows what, and how well.">
            <Topic id="skills-add" title="Add your skills">
              <StepList
                steps={[
                  {
                    icon: Star,
                    text: (
                      <>
                        List your skills in <strong>Settings → Profile</strong>: type a skill and
                        press Enter, or paste a comma-separated list, then{" "}
                        <strong>Save profile</strong>. Remove one with × or Backspace.
                      </>
                    ),
                  },
                  {
                    icon: UserRound,
                    text: (
                      <>
                        Each organisation keeps its own skills and levels for you, so if you're in
                        several, you set your skills separately in each — Settings shows the
                        organisation you have selected; switch organisations at the top right. (
                        <a href="#skills-connect">Connected organisations</a> share one list.)
                        People who may change titles there can also edit your skills on the People
                        and Skills pages.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="skills-levels" title="Levels and colours">
              <StepList
                steps={[
                  {
                    icon: Layers,
                    text: (
                      <>
                        Each skill can have a level, picked on its chip. By default there are four:{" "}
                        <strong>Novice, Basic, Advanced and Master</strong>; a new skill starts with
                        no level.
                      </>
                    ),
                  },
                  {
                    icon: Palette,
                    text: (
                      <>
                        Skills are coloured by level everywhere, from yellow for the lowest to pink
                        for the highest — with the default four, Novice yellow, Basic mint, Advanced
                        lavender and Master pink — and grey without a level.
                      </>
                    ),
                  },
                  {
                    icon: Settings2,
                    text: (
                      <>
                        Anyone who can rename the organisation can choose how many levels it uses —
                        from 2 to 7 — and what they're called under{" "}
                        <strong>Settings → Skill levels</strong>, for example in Finnish, or reset
                        them. If the organisation lowers the number of levels, anyone above it shows
                        at the highest level until it's raised again.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="skills-suggestions" title="Suggestions while you type">
              <StepList
                steps={[
                  {
                    icon: Search,
                    text: (
                      <>
                        As you type a new skill, a list shows the organisation's existing skills
                        that match — those starting with what you typed first, then the most common
                        — with how many people have each. Pick one with the arrow keys and Enter, or
                        click it; Escape closes the list.
                      </>
                    ),
                  },
                  {
                    icon: Copy,
                    text: (
                      <>
                        Typing an existing skill in different letters, such as <em>react</em> when{" "}
                        <em>React</em> exists, uses the existing spelling, so one skill isn't
                        written two ways.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="skills-page" title="The Skills page">
              <StepList
                steps={[
                  {
                    icon: Sparkles,
                    text: (
                      <>
                        The <strong>Skills</strong> page in the side menu has a card for every skill
                        in the organisation, with who has it and at what level, most widely held
                        first. Search finds both skills and people. The <strong>Development</strong>{" "}
                        tab, next to Skills, shows how levels have changed over time, by skill, by
                        person or by team, with the latest changes below — and{" "}
                        <strong>Show all changes</strong> for the whole history. Choose a time frame
                        — 30 days, a quarter, 12 months, all time, or custom dates — to look at a
                        period. By skill, pick <strong>All skills</strong> for one line over every
                        skill, or tick any number of skills for a line each. By team, pick a team or
                        a <strong>team of teams</strong> (set up on the Teams page) to see its
                        teams' people together. Under the chart,{" "}
                        <strong>Learning engagement</strong> shows who in the view is actively
                        learning — their level rose in the time frame, or they're in a Learning with
                        group — and who isn't yet. It's <strong>cumulative</strong> by default:
                        levels add up into level points (Novice 1, Basic 2, …), so the total grows
                        as people learn and as new people gain a level. <strong>Average</strong>{" "}
                        shows the average level of those who have one — then a person's view has a
                        line per skill. <strong>Average (everyone)</strong> divides by everyone in
                        the organisation or team, counting people without the skill or a level as 0.
                        Changes are recorded from 5 November 2026 on.
                      </>
                    ),
                  },
                  {
                    icon: Plus,
                    text: (
                      <>
                        Add a skill to someone with <strong>Add a skill</strong> at the top, or{" "}
                        <strong>+ Add person</strong> on a skill's card. Change a level or remove a
                        skill right on the card. People who may change titles can also add a skill
                        nobody has yet — choose <strong>Nobody yet</strong> as the person — for
                        example a skill the organisation wants people to learn. It gets a card of
                        its own, and an empty card can be removed with its bin icon. The star on a
                        card marks a skill <strong>strategic</strong> — one the organisation wants
                        to build up. Strategic skills come first with a badge, the{" "}
                        <strong>Strategic only</strong> filter shows just them, Development has a
                        quick <strong>Strategic skills</strong> choice, and Teams stars them.
                      </>
                    ),
                  },
                  {
                    icon: Link2,
                    text: (
                      <>
                        Drag a name onto another in the same card to have them{" "}
                        <a href="#learning">learn that skill together</a>.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="skills-merge" title="Merge skills that mean the same">
              <StepList
                steps={[
                  {
                    icon: Merge,
                    text: (
                      <>
                        At the top of the Skills page, people who may change titles see skills that
                        look like one thing written differently. It recognises other spellings and
                        punctuation (<em>Project-management</em>), singular and plural (
                        <em>Workshop</em> / <em>Workshops</em>), the same word in another form (
                        <em>Ratsastaminen</em> / <em>Ratsastus</em>, <em>Mentoring</em> /{" "}
                        <em>Mentorointi</em>), small typos, abbreviations (<em>PM</em> /{" "}
                        <em>Project management</em>) and <em>.js</em> variants. It doesn't know
                        synonyms or translations.
                      </>
                    ),
                  },
                  {
                    icon: Layers,
                    text: (
                      <>
                        Choose the name to <strong>Keep</strong> — the most common by default — and
                        select <strong>Merge</strong>. Everyone who has any of them gets the kept
                        name once, at the highest level they had, and their learning groups move
                        along. Only this organisation's skills change.
                      </>
                    ),
                  },
                  {
                    icon: EyeOff,
                    text: (
                      <>
                        <strong>Not the same</strong> hides a suggestion. It's remembered in your
                        browser only.
                      </>
                    ),
                  },
                  {
                    icon: Merge,
                    text: (
                      <>
                        To merge skills the suggestions don't catch — synonyms or translations such
                        as <em>Mentoring</em> and <em>Ohjaus</em> — select{" "}
                        <strong>Merge skills…</strong>, pick two or more skills, choose which name
                        to keep or type <strong>Another name…</strong>, and confirm.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="skills-in-teams" title="Skills in teams">
              <StepList
                steps={[
                  {
                    icon: Network,
                    text: (
                      <>
                        Each card on the <a href="#teams">Teams</a> page lists every skill its
                        members have, most widely held first, with how many have it. The colour is
                        the best level in the team; point at a skill to see who has it and at what
                        level.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="skills-connect" title="Connect organisations">
              <StepList
                steps={[
                  {
                    icon: Link2,
                    text: (
                      <>
                        Organisations can be connected so they share their skill list, skill level
                        names and people's skills: someone in several connected organisations has
                        one list of skills and levels for all of them. Each organisation still sees
                        only its own people, and teams and learning groups stay separate.
                      </>
                    ),
                  },
                  {
                    icon: KeyRound,
                    text: (
                      <>
                        An owner or admin opens <strong>Settings → Connected organisations</strong>{" "}
                        and selects <strong>Create a connection code</strong>. An owner or admin of
                        the other organisation enters it under <strong>Connect with a code</strong>.
                        A code works once, for 7 days.
                      </>
                    ),
                  },
                  {
                    icon: Layers,
                    text: (
                      <>
                        On connecting, the skill lists are combined and the level names of the
                        organisation that made the code are used. Someone in both keeps every skill
                        from both, at the higher level.
                      </>
                    ),
                  },
                  {
                    icon: Trash2,
                    text: (
                      <>
                        An owner or admin can <strong>disconnect</strong> their organisation. It
                        keeps a copy of the shared skill list, level names and its people's skills,
                        and from then on they're separate again.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>
          </Section>

          <Section
            id="learning"
            icon={Link2}
            title="Learning together"
            blurb="Pair people up to learn a skill."
          >
            <StepList
              steps={[
                {
                  icon: Link2,
                  text: (
                    <>
                      On the <a href="#skills-page">Skills page</a>, drag a name onto another name
                      in the same skill card. The two form a <strong>Learning with</strong> group,
                      listed at the bottom of the card and numbered next to their names. Drop
                      someone on a person already in a group and they join that group.
                    </>
                  ),
                },
                {
                  icon: Smartphone,
                  text: (
                    <>
                      On a phone, or without a mouse, tap one name and then the other. Tap the same
                      name again to cancel.
                    </>
                  ),
                },
                {
                  icon: Users,
                  text: (
                    <>
                      The <strong>Learning with</strong> column on the People page shows each
                      person's groups. <strong>Learn with…</strong> picks one of their skills and
                      someone else who has it; × takes them out of a group.
                    </>
                  ),
                },
                {
                  icon: Layers,
                  text: (
                    <>
                      A person is in one learning group per skill, but can learn different skills
                      with different people. Moving someone to another group takes them out of the
                      old one. Anyone in the organisation can arrange the groups.
                    </>
                  ),
                },
                {
                  icon: Trash2,
                  text: (
                    <>
                      A group left with one person disappears, and a person leaves a group when the
                      skill is removed from them or they leave the organisation.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="pulse"
            icon={Activity}
            title="Talentloom Pulse"
            blurb="Free surveys and structured interviews, compared round by round."
          >
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Pulse asks the same people the same questions again and again, so you can see what
              moved. Open <strong>Pulse surveys</strong> in the menu, or read the overview on the{" "}
              <Link to="/pulse" className="font-medium text-primary hover:underline">
                Pulse page
              </Link>
              .
            </p>

            <Topic title="Create a survey">
              <StepList
                steps={[
                  {
                    icon: Activity,
                    text: (
                      <>
                        Select <strong>New survey</strong> and give it a title and description.
                        Choose the type: a <strong>survey</strong> people answer themselves, or a{" "}
                        <strong>structured interview</strong> you fill in while talking to someone.
                      </>
                    ),
                  },
                  {
                    icon: Users,
                    text: (
                      <>
                        Choose who owns it: just you, all organisations you're a member of, selected
                        organisations, or other people you invite by email as co-owners. Owners can
                        see and edit the survey.
                      </>
                    ),
                  },
                  {
                    icon: Link2,
                    text: (
                      <>
                        Choose how people answer: <strong>anyone with the link</strong>,{" "}
                        <strong>invited people only</strong>, or both.
                      </>
                    ),
                  },
                  {
                    icon: Building2,
                    text: (
                      <>
                        Turn on <strong>Share with my organisation</strong> to add every member of
                        the organisation you currently have open as an invited person. They find the
                        survey under <strong>Waiting for your answer</strong>, and are emailed when
                        you start a round.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic title="Questions and measured things">
              <StepList
                steps={[
                  {
                    icon: ListChecks,
                    text: (
                      <>
                        Add questions in the <strong>Questions</strong> tab. Types: rating 1–5,
                        rating 1–5 with a reason, multiple choice (one or many), free text, and yes
                        / no. Mark a question required, reorder, or delete it.
                      </>
                    ),
                  },
                  {
                    icon: Layers,
                    text: (
                      <>
                        Give a statement a <strong>measured thing</strong> — for example "Wellbeing"
                        — to group it with the other statements that measure the same thing. Results
                        then show one average per measured thing as well as each statement.
                      </>
                    ),
                  },
                  {
                    icon: Upload,
                    text: (
                      <>
                        Use <strong>Import statements</strong> to paste many at once, one per line.
                        Write the measured thing first to group them, like{" "}
                        <em>Wellbeing; I feel rested at work</em>. Two columns copied from a
                        spreadsheet work too.
                      </>
                    ),
                  },
                  {
                    icon: Lock,
                    text: (
                      <>
                        Questions are locked while a round is open, so everyone in a round answers
                        the same thing. Close the round to edit; changes apply from the next round.
                        Keep wording stable so rounds stay comparable — deleting a question also
                        deletes its earlier answers.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic title="Rounds and inviting people">
              <StepList
                steps={[
                  {
                    icon: Repeat,
                    text: (
                      <>
                        In <strong>Rounds & sharing</strong>, start a round — optionally with a
                        closing date. Starting a new round closes the current one. You can also
                        close or reopen a round by hand.
                      </>
                    ),
                  },
                  {
                    icon: Link2,
                    text: (
                      <>
                        <strong>Copy public link</strong> gives a link for the open round that
                        anyone can answer. These answers are anonymous and can't be followed from
                        round to round.
                      </>
                    ),
                  },
                  {
                    icon: Mail,
                    text: (
                      <>
                        In <strong>Invited people</strong>, add people one per line as "Name, email"
                        or just an email. Each gets a <strong>personal link</strong> that stays the
                        same for every round, which is what lets Pulse follow their answers over
                        time. An email already on the list is skipped.
                      </>
                    ),
                  },
                  {
                    icon: Send,
                    text: (
                      <>
                        When you start a round, Pulse emails each invited person their personal link
                        — switch this off before starting if you'd rather send the links yourself.
                        While a round is open, <strong>Email a reminder</strong> in Invited people
                        emails only those who haven't answered yet.
                      </>
                    ),
                  },
                  {
                    icon: Inbox,
                    text: (
                      <>
                        Invited people with a Talentloom account also see open rounds under{" "}
                        <strong>Waiting for your answer</strong> on their Pulse surveys page.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic title="Answering">
              <StepList
                steps={[
                  {
                    icon: Send,
                    text: (
                      <>
                        Open the link, answer, and select <strong>Send answers</strong>. No account
                        is needed. Each personal link can answer a round once.
                      </>
                    ),
                  },
                  {
                    icon: History,
                    text: (
                      <>
                        From the second round on, people answering through their personal link see
                        their own earlier answers under each question, newest first, with a small
                        trend for ratings. Turn this off per survey with{" "}
                        <strong>Show people their previous answers</strong> in the survey's
                        Settings.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic title="Results">
              <StepList
                steps={[
                  {
                    icon: BarChart3,
                    text: (
                      <>
                        The <strong>Results</strong> tab shows every round side by side for each
                        question — averages for ratings, share of yes, counts per option, and the
                        written answers — with the change since the previous round.
                      </>
                    ),
                  },
                  {
                    icon: Layers,
                    text: (
                      <>
                        <strong>Measured things</strong> shows the average rating across each
                        group's statements per round.
                      </>
                    ),
                  },
                  {
                    icon: EyeOff,
                    text: (
                      <>
                        <strong>How each person moved</strong> compares each invited person's
                        average rating between the last two rounds. Your own row is marked{" "}
                        <strong>You</strong>; everyone else is shown as Person 1, Person 2, and so
                        on, without names or emails.
                      </>
                    ),
                  },
                  {
                    icon: Building2,
                    text: (
                      <>
                        If the survey is shared with organisations, filter results to one of them.
                        The filter counts invited people who are members of that organisation;
                        public-link answers can't be tied to an organisation and are left out.
                      </>
                    ),
                  },
                  {
                    icon: Download,
                    text: (
                      <>
                        <strong>Export CSV</strong> downloads every answer, one row per answer, with
                        round, time, question, measured thing, answer and reason. It opens directly
                        in Excel.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic title="Structured interviews">
              <StepList
                steps={[
                  {
                    icon: Mic,
                    text: (
                      <>
                        For an interview-type survey, add people in <strong>Interviewees</strong>,
                        start a round, then use <strong>Run interview</strong> to pick a person and
                        record their answers yourself. Results compare rounds the same way.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic title="Managing a survey">
              <StepList
                steps={[
                  {
                    icon: Settings2,
                    text: (
                      <>
                        The survey's <strong>Settings</strong> tab changes its title, description,
                        owners, and how people answer.
                      </>
                    ),
                  },
                  {
                    icon: Copy,
                    text: (
                      <>
                        <strong>Duplicate survey</strong> copies the settings, owners and questions
                        into a new survey. Rounds, answers and invited people are not copied.
                      </>
                    ),
                  },
                  {
                    icon: Trash2,
                    text: (
                      <>
                        <strong>Delete survey</strong> removes it with all its answers. If you
                        created a survey for organisations and have since left all of them, only a
                        member who can manage titles in one of those organisations can delete it.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic title="Who sees what">
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <Fact
                  icon={ShieldCheck}
                  text={
                    <>
                      Only the survey's owners and the owners and admins of its organisations see
                      the list of invited people and their personal links.
                    </>
                  }
                />
                <Fact
                  icon={EyeOff}
                  text={
                    <>
                      Other members who can open the survey see results without names, and only
                      their own details in an export.
                    </>
                  }
                />
                <Fact
                  icon={History}
                  text={
                    <>
                      Earlier answers are shown only to the person who gave them, through their own
                      personal link.
                    </>
                  }
                />
                <Fact
                  icon={Activity}
                  text={<>Pulse is free, and personal surveys work without an organisation.</>}
                />
              </ul>
            </Topic>
          </Section>

          <Section id="settings" icon={Settings2} title="Settings" blurb="Make Talentloom yours.">
            <StepList
              steps={[
                {
                  icon: Settings2,
                  text: (
                    <>
                      In <strong>Settings</strong>, update your name and{" "}
                      <a href="#skills-add">skills</a> and choose a light or dark appearance.
                      Settings is available even before you have an organisation.
                    </>
                  ),
                },
                {
                  icon: Building2,
                  text: (
                    <>
                      The <strong>Organisation</strong> panel is where you rename the organisation,
                      set titles and permissions, name the <a href="#skills-levels">skill levels</a>
                      , and delete the organisation. People, invites and teams are managed on their
                      own pages — see <a href="#organisations">Organisations & people</a> and{" "}
                      <a href="#teams">Teams</a>.
                    </>
                  ),
                },
                {
                  icon: Sparkles,
                  text: <>Clear sample candidates and positions without affecting your own data.</>,
                },
                {
                  icon: Clock3,
                  text: (
                    <>
                      LinkedIn, Indeed, and ATS connections are marked <strong>Coming soon</strong>;
                      CSV import is available now.
                    </>
                  ),
                },
                {
                  icon: LogIn,
                  text: (
                    <>
                      <strong>Sign out</strong> is always in the top-right corner.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="good-to-know"
            icon={Sparkles}
            title="Good to know"
            blurb="Handy facts before you dive in."
          >
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <Fact
                icon={ShieldCheck}
                text={
                  <>
                    The public job board, apply pages, and survey links work without sign-in.
                    Recruiter tools need an organisation; application history needs an account.
                  </>
                }
              />
              <Fact
                icon={Smartphone}
                text={
                  <>
                    Candidate flow drag-and-drop is designed for desktop. On touch devices, use the
                    stage selector on the candidate record.
                  </>
                }
              />
              <Fact
                icon={FileText}
                text={
                  <>
                    Candidate files accept PDF, DOC, and DOCX up to 10 MB. Secure file links expire
                    after one hour.
                  </>
                }
              />
              <Fact
                icon={ShieldCheck}
                text={
                  <>
                    Each organisation's data is kept separate and protected by row-level security.
                  </>
                }
              />
              <Fact
                icon={RefreshCw}
                text={
                  <>
                    When a new version of Talentloom is published, a bar at the bottom offers{" "}
                    <strong>Reload</strong> — it never reloads by itself, so nothing you're typing
                    is lost. If a page can't load right after an update, it retries on its own.
                  </>
                }
              />
            </ul>
          </Section>
        </div>
      </article>
    </MarketingShell>
  );
}
