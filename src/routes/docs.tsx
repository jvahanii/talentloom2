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
  TrendingUp,
  CalendarRange,
  Info,
  Boxes,
  Map as MapIcon,
  Workflow,
  CalendarDays,
  Wallet,
  Coins,
  Percent,
  GitCompare,
  Gift,
  Undo2,
  Globe,
  Route as RouteIcon,
  UserCheck,
  Palmtree,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Talentloom user guide" },
      {
        name: "description",
        content:
          "Learn how to find roles, run your hiring organisation, organise and pay your people, and follow them over time with Talentloom Pulse surveys.",
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
  { id: "org-chart", label: "Org chart & teams" },
  { id: "work", label: "Work and vacations" },
  { id: "skills", label: "Skills" },
  { id: "learning", label: "Learning together" },
  { id: "careers", label: "Career paths" },
  { id: "compensation", label: "Compensation" },
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
            Everything you need to find a role, run a clear hiring process, organise and pay your
            people, or follow how they feel over time with Pulse — explained step by step.
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
                      Invited by email? Open the link in your invitation and sign in with the email
                      it was sent to. You join that organisation directly. A shared invite link only
                      creates your account; you join once someone in the organisation adds you.
                    </>
                  ),
                },
                {
                  icon: UserRound,
                  text: (
                    <>
                      After signing in you land where you belong: the organisation you last used, if
                      you're in one; otherwise your surveys, if you have any; otherwise the job
                      board to explore open roles. Brand-new accounts are first asked whether
                      they're a recruiter or a candidate.
                    </>
                  ),
                },
                {
                  icon: Activity,
                  text: (
                    <>
                      You don't need an organisation to use <a href="#pulse">Pulse surveys</a>.
                      Without one, the menu shows only Surveys and Settings, plus a link to create
                      an organisation when you want one.
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
                      Select <strong>Explore open roles</strong> to browse the job board: positions
                      posted on Talentloom and job ads imported every morning from public lists.
                      Every matching role is listed, with a count above the list, and each card
                      shows the day it was added. An imported ad opens the original ad on its own
                      site.
                    </>
                  ),
                },
                {
                  icon: Search,
                  text: (
                    <>
                      Search by title, department or company. Separate several titles with commas —{" "}
                      <em>designer, product manager</em> shows roles matching either. Words in{" "}
                      <strong>Exclude</strong>, such as <em>senior, intern</em>, hide every ad that
                      contains them, and the count says how many were hidden. Filter by company and
                      sort by newest, rating, deadline or company.
                    </>
                  ),
                },
                {
                  icon: History,
                  text: (
                    <>
                      <strong>Active</strong> shows open roles, <strong>Past</strong> closed ones
                      (deadline passed, or no longer listed), and <strong>All</strong> both.
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
                      Rate positions with the stars. Signed out, your rating is kept in this browser
                      for an hour and saved to your account when you select <strong>Sign in</strong>
                      . Signed in, sort by your ratings, see them under <strong>Rated</strong>, and
                      discard roles you're not interested in (they move to{" "}
                      <strong>Discarded</strong>). Your search, exclusions and filters are
                      remembered.
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
                      <a href="#learning">learning with</a>, and their{" "}
                      <a href="#salaries">salary</a>. Search finds people by name, email, skill or
                      level. On a phone each person shows as a card.
                    </>
                  ),
                },
                {
                  icon: Mail,
                  text: (
                    <>
                      To bring someone in, enter their email and a title on the People page. Someone
                      who already has an account is added straight away; anyone else gets an
                      invitation email that only they can use, once. Or share an invite link: anyone
                      who opens it can create an account, but they join only when someone adds them
                      from <strong>Signed up with a link</strong>, choosing their title. Invites and
                      links expire after 7 days; you can email an invite again, copy its link, or
                      revoke it.
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
            id="org-chart"
            icon={Workflow}
            title="Org chart & teams"
            blurb="How the organisation is built, who supervises whom, and who works together."
          >
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <strong>Org chart & teams</strong> in the side menu has three tabs:{" "}
              <a href="#org-chart-units">Units</a>, <a href="#supervisors">Supervisors</a> and{" "}
              <a href="#teams">Teams</a>. It opens on the tab you used last.
            </p>

            <Topic id="org-chart-charts" title="Charts">
              <StepList
                steps={[
                  {
                    icon: Workflow,
                    text: (
                      <>
                        Keep as many charts as you like, for example today's and a planned one.{" "}
                        <strong>New chart</strong>, <strong>Rename</strong>, <strong>Copy</strong>{" "}
                        and <strong>Delete</strong> sit beside the chart picker. An empty chart can
                        also be filled with a copy of another chart. Everyone in the organisation
                        can see and edit the charts.
                      </>
                    ),
                  },
                  {
                    icon: Star,
                    text: (
                      <>
                        Each chart is <strong>Active</strong>, <strong>Past</strong> or{" "}
                        <strong>Planned</strong>. Only one chart is active: it is today's
                        organisation, and bonus schemes count people by its units. A new chart
                        starts as planned (the first one is active), and the page opens on the
                        active chart. On a past or planned chart, the bar under the picker offers{" "}
                        <strong>Make active</strong> and <strong>Mark as past</strong> or{" "}
                        <strong>Mark as planned</strong>. Making a chart active turns the old active
                        one into a past chart.
                      </>
                    ),
                  },
                  {
                    icon: GitCompare,
                    text: (
                      <>
                        <strong>Compare</strong> lists what changes from another chart to this one,
                        matching units by name. <strong>Print / PDF</strong> prints just the chart
                        across a landscape page.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="org-chart-units" title="Units and their people">
              <StepList
                steps={[
                  {
                    icon: Building2,
                    text: (
                      <>
                        A unit, such as Finance or Accounting, has a name, an optional head, its
                        members and a note. Pick people from People or type a name by hand. Someone
                        is either a unit's head or one of its members, not both. Click a unit to
                        edit it; <strong>+</strong> adds a unit within it.
                      </>
                    ),
                  },
                  {
                    icon: Layers,
                    text: (
                      <>
                        Drag a unit onto another to make it part of it, or to its left or right edge
                        to place it beside it. While you drag, every place it can land is outlined
                        and the box under the pointer says what a drop there does.
                      </>
                    ),
                  },
                  {
                    icon: Users,
                    text: (
                      <>
                        The <strong>People</strong> list beside the chart shows everyone in People.
                        Drag someone onto a unit to add them, or drag members between units. People
                        in no unit are shown in amber, with a count. Sort the list by name or by
                        unit.
                      </>
                    ),
                  },
                  {
                    icon: Undo2,
                    text: (
                      <>
                        The small × on a member or a head takes them off the chart straight away.
                        You have 8 seconds to select <strong>Undo</strong>.
                      </>
                    ),
                  },
                  {
                    icon: Search,
                    text: (
                      <>
                        <strong>Find a unit or person</strong> outlines what matches and opens
                        folded branches; Enter jumps to the first match. Fold any branch, or use{" "}
                        <strong>Collapse all</strong> and <strong>Expand all</strong>. Zoom out and
                        in, or <strong>Fit</strong> the chart to the width. Switch from{" "}
                        <strong>Tree</strong> to <strong>List</strong> to see the chart as an
                        indented list. You can edit in both.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="org-chart-pay" title="Salaries on the chart">
              <StepList
                steps={[
                  {
                    icon: Coins,
                    text: (
                      <>
                        Turn on <strong>Show salaries</strong> to see salary costs a month and a
                        year: for the whole company, for each unit, and for each unit together with
                        the units within it. Someone in several units is counted once. Salaries come
                        from <a href="#salaries">People</a>.
                      </>
                    ),
                  },
                  {
                    icon: Percent,
                    text: (
                      <>
                        People whose title may change titles can select{" "}
                        <strong>Bulk adjust %</strong> to raise or lower pay by a percentage for the
                        whole company, for everyone placed in the chart, or for one unit. Pick the
                        people and an effective date, select <strong>Preview on chart</strong> to
                        see the new costs on the chart, then apply. Undo is offered right after.
                      </>
                    ),
                  },
                  {
                    icon: CalendarRange,
                    text: (
                      <>
                        On a past or planned chart, pay changes are only a plan. They are saved on
                        that chart and never change anyone's real pay or bonus. The cost summary
                        shows the chart's own people at their planned pay, next to today's real
                        costs and the difference. A pay button on a person plans their pay one by
                        one, and pay from a plan is tagged <strong>planned</strong>.{" "}
                        <strong>Discard planned pay</strong> removes the plans. When you make the
                        chart active, you can make its planned pay real or keep it as a plan.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="supervisors" title="Supervisors">
              <StepList
                steps={[
                  {
                    icon: UserCheck,
                    text: (
                      <>
                        The <strong>Supervisors</strong> tab lists everyone and their supervisors. A
                        person can have several. It says how many have a supervisor, and people
                        without one are highlighted.
                      </>
                    ),
                  },
                  {
                    icon: Sparkles,
                    text: (
                      <>
                        Suggestions come from the active org chart: a unit's head supervises its
                        members and is supervised by the head of the unit above. Accept them one by
                        one, or select <strong>Accept all</strong>. Supervisor relationships can't
                        go round in a circle, so those aren't offered.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="teams" title="Teams">
              <StepList
                steps={[
                  {
                    icon: Network,
                    text: (
                      <>
                        The <strong>Teams</strong> tab shows the organisation's teams and who is in
                        each. Teams belong to the whole organisation, not to a chart. A person can
                        be in several teams; people in no team are listed at the bottom. Old links
                        to the Teams page open this tab.
                      </>
                    ),
                  },
                  {
                    icon: Plus,
                    text: (
                      <>
                        People whose title may change titles create a team with a name and an
                        optional description, rename or describe it right on its card, add people
                        with <strong>+ Add person</strong>, take them out with ×, or delete the
                        team. Its people stay in the organisation.
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
                    icon: Boxes,
                    text: (
                      <span id="teams-of-teams" className="scroll-mt-24">
                        <strong>Teams of teams</strong>, below the teams, put several teams together
                        — for example a product area. Name one, pick its teams and select{" "}
                        <strong>Create</strong>; add or remove teams on its card later. A team can
                        be in many teams of teams, but a team of teams holds only teams. Each card
                        shows how many people it has and the skills they share, and{" "}
                        <a href="#skills-development">Skill development</a> and{" "}
                        <a href="#bonus-schemes">bonus schemes</a> can treat a team of teams as one.
                      </span>
                    ),
                  },
                  {
                    icon: MapIcon,
                    text: (
                      <>
                        Teams can place themselves on the{" "}
                        <a href="#skills-topology">Org topology map</a> on the Skills page.
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
            </Topic>
          </Section>

          <Section
            id="work"
            icon={CalendarDays}
            title="Work and vacations"
            blurb="Working time, holidays, absences and vacation days."
          >
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <strong>Work and vacations</strong> in the side menu covers the organisation's working
              time and everyone's absences. Everyone in the organisation can see and edit it. Dates,
              month and day names and the first day of the week follow your own browser's settings,
              for example 20.11.2026 with Monday first in Finland.
            </p>
            <StepList
              steps={[
                {
                  icon: CalendarDays,
                  text: (
                    <>
                      The <strong>Calendar</strong> shows a month of national holidays, the
                      organisation's own days off and everyone's absences, sized to fit the screen.
                      Each day shows two absences and <strong>+N more</strong>; click a day to see
                      all of it. Find a person or a kind of absence with the search.
                    </>
                  ),
                },
                {
                  icon: Plus,
                  text: (
                    <>
                      <strong>Add an absence</strong>: pick the person, the kind of absence, the
                      dates and an optional note. The dialog shows how many vacation days the person
                      has left. A person can't have two absences on the same day: you are warned and
                      offered the existing one to edit instead.
                    </>
                  ),
                },
                {
                  icon: Palmtree,
                  text: (
                    <>
                      <strong>Vacation days</strong> lists each person's days earned, used and left
                      this vacation year. It is a demo calculation: by default 2.5 days for each
                      month from 1 April. Open a person to set their own working week, hours,
                      holidays and days a month, or enter earned and used days by hand.
                    </>
                  ),
                },
                {
                  icon: Globe,
                  text: (
                    <>
                      <strong>Holidays and days off</strong> lists national holidays for one or more
                      countries (Finland by default). Any holiday can be made a working day, and the
                      organisation can add its own days off, once or every year.
                    </>
                  ),
                },
                {
                  icon: Palette,
                  text: (
                    <>
                      <strong>Kinds of absence</strong> has the built-in kinds: annual, unpaid, sick
                      and other, plus the statutory leave of the person's country. Add the
                      organisation's own, such as <em>pekkasvapaa</em>, with a name, a colour and
                      whether it uses vacation days. A removed kind is no longer offered, but
                      absences already marked with it keep it, and it can be brought back.
                    </>
                  ),
                },
                {
                  icon: Clock3,
                  text: (
                    <>
                      <strong>Working time</strong> sets the working days, hours a day, vacation
                      days a month and the month the vacation year starts.
                    </>
                  ),
                },
                {
                  icon: History,
                  text: (
                    <>
                      <strong>History</strong> records every change: who made it, when, and what it
                      was before and after. Filter it by kind of record and by person. Each
                      absence's dialog also shows its own history. The history can't be edited or
                      deleted.
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
                        first. Search finds both skills and people. The page has three tabs —{" "}
                        <strong>Skills</strong>, <a href="#skills-development">Development</a> and
                        the <a href="#skills-topology">Org topology map</a> — and opens on the one
                        you used last.
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

            <Topic id="skills-development" title="Skill development">
              <StepList
                steps={[
                  {
                    icon: TrendingUp,
                    text: (
                      <>
                        The <strong>Development</strong> tab on the Skills page charts how skill
                        levels have changed over time. Look at it <strong>by skill</strong> —{" "}
                        <strong>All skills</strong> for one line over every skill, any number of
                        skills ticked for a line each, or the quick{" "}
                        <strong>Strategic skills</strong> choice — <strong>by person</strong>, or{" "}
                        <strong>by team</strong>, where you can also pick a{" "}
                        <a href="#teams-of-teams">team of teams</a> to see its teams' people
                        together.
                      </>
                    ),
                  },
                  {
                    icon: CalendarRange,
                    text: (
                      <>
                        Choose a time frame: <strong>30 days</strong>, a calendar{" "}
                        <strong>Quarter</strong>, <strong>12 months</strong>,{" "}
                        <strong>All time</strong>, or <strong>Custom</strong> dates. The latest
                        changes are listed below the chart; <strong>Show all changes</strong> opens
                        the whole history. Changes are recorded from 5 November 2026 on.
                      </>
                    ),
                  },
                  {
                    icon: BarChart3,
                    text: (
                      <>
                        It's <strong>Cumulative</strong> by default: levels add up into level points
                        (Novice 1, Basic 2, …), so the total grows as people learn and as new people
                        gain a level. <strong>Average</strong> shows the average level of those who
                        have one — then a person's view has a line per skill.{" "}
                        <strong>Average (everyone)</strong> divides by everyone in the organisation
                        or team, counting people without the skill or a level as 0.
                      </>
                    ),
                  },
                  {
                    icon: Activity,
                    text: (
                      <>
                        <strong>Learning engagement</strong> under the chart shows who in the view
                        is <strong>actively learning</strong>: a level of theirs rose to a higher
                        one in the time frame, or they're in a <a href="#learning">Learning with</a>{" "}
                        group. A skill's first level is an assessment, not learning, so it doesn't
                        count. For each person it lists the skills they levelled up —{" "}
                        <strong>together with others</strong> (in a skill they learn in a group) or{" "}
                        <strong>on their own</strong> — and what they're learning with others. Those{" "}
                        <strong>not yet engaged</strong> are listed too, with any first levels
                        they've set.
                      </>
                    ),
                  },
                  {
                    icon: Info,
                    text: (
                      <>
                        <strong>How is this calculated?</strong> under the chart explains every
                        number. Your choices — view, skills, time frame and measure — are remembered
                        in your browser for each organisation.
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

            <Topic id="skills-topology" title="Org topology map">
              <StepList
                steps={[
                  {
                    icon: Network,
                    text: (
                      <>
                        The <strong>Org topology map</strong> tab on the Skills page is where teams
                        place themselves by the scope of their skills mandate (functional to
                        expanding) and of their work mandate (tasks to expanding). Pick a team,
                        choose <strong>Where we are</strong> or <strong>Where we're heading</strong>
                        , then drag the team from the list onto the map or click any spot on it;
                        drag a dot to move it. A dot can sit anywhere within its square, and an
                        arrow joins where the team is to where it's heading. A team's members can
                        place it, and so can anyone who may change titles. It's based on the Org
                        Topologies™ model (orgtopologies.com).
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
                        Each card on the <a href="#teams">Teams</a> tab lists every skill its
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
            id="careers"
            icon={RouteIcon}
            title="Career paths"
            blurb="Where people can go next, and how ready they are."
          >
            <StepList
              steps={[
                {
                  icon: RouteIcon,
                  text: (
                    <>
                      <strong>Career paths</strong> in the side menu is a career map. Job families,
                      such as Engineering or Sales, are columns, and levels go from bottom to top.
                      Moving up a column is a promotion; an arrow is a move sideways to another
                      family. Start with <strong>Job family</strong>, then add its roles level by
                      level. <strong>Levels</strong> names the levels.
                    </>
                  ),
                },
                {
                  icon: Sparkles,
                  text: (
                    <>
                      A role has a name, a family, a level, an optional description and salary
                      range, and the <a href="#skills">skills</a> it asks for, each at a level.
                      Click a role to see its skills, its people and its moves sideways. You can
                      also edit it, place someone in it, or add a move to another role there.
                    </>
                  ),
                },
                {
                  icon: UserRound,
                  text: (
                    <>
                      Pick a person in <strong>Show the map for</strong> to see where they are and
                      what's next. Every role is coloured by how their skills fit:{" "}
                      <strong>Ready</strong> when they meet every skill it asks for,{" "}
                      <strong>Close</strong> when they meet at least half, and{" "}
                      <strong>Further</strong> otherwise. Their next options are outlined. A role
                      that asks for no skills stays neutral.
                    </>
                  ),
                },
                {
                  icon: ShieldCheck,
                  text: <>Everyone in the organisation can edit the career map for now.</>,
                },
              ]}
            />
          </Section>

          <Section
            id="compensation"
            icon={Wallet}
            title="Compensation"
            blurb="Salaries, their history, and bonus schemes."
          >
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <strong>Compensation</strong> in the side menu has two tabs,{" "}
              <a href="#salaries">Salaries</a> and <a href="#bonus-schemes">Bonus schemes</a>.
            </p>

            <Topic id="salaries" title="Salaries">
              <StepList
                steps={[
                  {
                    icon: Coins,
                    text: (
                      <>
                        Click the <strong>Salary</strong> column on the People page, or a row under
                        Compensation → Salaries, to open a person's salary history, newest first.{" "}
                        <strong>Add salary</strong> or <strong>Change salary</strong> records an
                        amount, a currency, whether it's monthly, annual or hourly, the date it
                        takes effect and an optional note, such as <em>Annual review</em>. The
                        dialog shows the change from the previous salary. A salary with a later date
                        is shown as scheduled.
                      </>
                    ),
                  },
                  {
                    icon: KeyRound,
                    text: (
                      <>
                        People whose title may change titles can change anyone's salary, and entries
                        can be edited or deleted.
                      </>
                    ),
                  },
                  {
                    icon: BarChart3,
                    text: (
                      <>
                        The <strong>Salaries</strong> tab lists everyone's current salary, its cost
                        a year, since when, the salary before and the change in per cent and in
                        money. Totals at the top show the people with a salary, the cost a year, the
                        average change and the number of raises and decreases. Find a person or sort
                        by name, salary, change or latest change.
                      </>
                    ),
                  },
                  {
                    icon: Workflow,
                    text: (
                      <>
                        The org chart can show salary costs per unit and plan changes in bulk; see{" "}
                        <a href="#org-chart-pay">Salaries on the chart</a>.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>

            <Topic id="bonus-schemes" title="Bonus schemes">
              <StepList
                steps={[
                  {
                    icon: Gift,
                    text: (
                      <>
                        A scheme has a name, a period, a target bonus (a per cent of annual salary,
                        or a fixed sum), a threshold, a cap and a status: Draft, Active or Closed.
                        Below the threshold nothing is paid. Above it, the bonus grows with the
                        results, up to the cap. New schemes are capped at 100% of the target.
                      </>
                    ),
                  },
                  {
                    icon: Users,
                    text: (
                      <>
                        <strong>Who the scheme covers</strong>: the entire company (where a new
                        scheme starts), org chart units with the units within them, teams,{" "}
                        <a href="#teams-of-teams">teams of teams</a> or people by name. Anyone can
                        be left out. People are worked out again each time, so someone who joins a
                        covered unit or team is included, and each person shows why. Units come from
                        the active org chart only, so a planned chart never changes anyone's bonus.
                        Targeting a unit or team carries a warning about local optimisation, and
                        targeting named people a strong one.
                      </>
                    ),
                  },
                  {
                    icon: ListChecks,
                    text: (
                      <>
                        A scheme has three steps. <strong>Measures and people</strong>: what the
                        bonus is paid for, each with a weight. A company-wide measure (EBITDA, cash
                        flow) has one result for everyone; a per-person measure (customer
                        satisfaction, own sales) has a result for each person.{" "}
                        <strong>Results</strong>: enter each achievement in per cent.{" "}
                        <strong>Payouts</strong>: each person's bonus and its status, with a{" "}
                        <strong>CSV</strong> download. Missing results count as 0 until they're in.
                      </>
                    ),
                  },
                  {
                    icon: BarChart3,
                    text: (
                      <>
                        Each scheme shows a summary: its people, the results completed, the average
                        achievement and the total payout. Annual salaries come from{" "}
                        <a href="#salaries">Salaries</a>. Everyone in the organisation can edit
                        bonus schemes for now.
                      </>
                    ),
                  },
                ]}
              />
            </Topic>
          </Section>

          <Section
            id="pulse"
            icon={Activity}
            title="Talentloom Pulse"
            blurb="Free surveys and structured interviews, compared round by round."
          >
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Pulse asks the same people the same questions again and again, so you can see what
              moved. Open <strong>Surveys</strong> in the menu, or read the overview on the{" "}
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
                        <strong>Waiting for your answer</strong> on their Surveys page.
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
                      <a href="#skills-add">skills</a> for the organisation you have selected.
                      Settings is available even before you have an organisation.
                    </>
                  ),
                },
                {
                  icon: Building2,
                  text: (
                    <>
                      The <strong>Organisation</strong> panel is where you rename the organisation,
                      choose and name the <a href="#skills-levels">skill levels</a>, set titles and
                      permissions, <a href="#skills-connect">connect organisations</a>, and delete
                      the organisation. People, invites and teams are managed on their own pages —
                      see <a href="#organisations">Organisations & people</a> and{" "}
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
              <Fact
                icon={Layers}
                text={
                  <>
                    Pages with tabs, such as Skills, Org chart & teams, Work and vacations and
                    Compensation, open on the tab you used last in this browser.
                  </>
                }
              />
              <Fact
                icon={Sparkles}
                text={
                  <>
                    Now and then a cat or a pig peeks up from the bottom of the page for a few
                    seconds. Click to send them off. If you prefer reduced motion, they fade in
                    instead.
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
