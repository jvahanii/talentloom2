import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
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
        <div>
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** A titled group of steps inside a section. */
function Topic({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="font-display text-base font-semibold">{title}</h3>
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
  { id: "organisations", label: "Organisations & teams" },
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
                      Invited to a team? Open the link in your invitation and sign in with the
                      email it was sent to. You join that organisation directly.
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
            title="Organisations & teams"
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
                  icon: Mail,
                  text: (
                    <>
                      In <strong>Settings → Invite a teammate</strong>, enter an email and a title.
                      The person gets an invitation email, and only they can use it, once. Leave the
                      email empty to get a link anyone can use. Invites expire after 7 days; you can
                      email one again, copy its link, or revoke it.
                    </>
                  ),
                },
                {
                  icon: KeyRound,
                  text: (
                    <>
                      Every member has a title — Owner, Admin, Member, or one you define. Under{" "}
                      <strong>Titles & permissions</strong> you decide exactly what each title can
                      do: view, edit and delete candidates and positions, invite and remove people,
                      import, export, rename the organisation, and more.
                    </>
                  ),
                },
                {
                  icon: Users,
                  text: (
                    <>
                      Under <strong>Users</strong> you can change someone's title or remove them.
                      An organisation always keeps at least one person who can manage titles.
                    </>
                  ),
                },
                {
                  icon: Trash2,
                  text: (
                    <>
                      An owner can <strong>delete the organisation</strong> by typing its name to
                      confirm. This permanently removes its candidates, positions, history,
                      organisation surveys and invites. Members keep their accounts and their other
                      organisations.
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
                        rating 1–5 with a reason, multiple choice (one or many), free text, and
                        yes / no. Mark a question required, reorder, or delete it.
                      </>
                    ),
                  },
                  {
                    icon: Layers,
                    text: (
                      <>
                        Give a statement a <strong>measured thing</strong> — for example
                        "Wellbeing" — to group it with the other statements that measure the same
                        thing. Results then show one average per measured thing as well as each
                        statement.
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
                        When you start a round, Pulse emails each invited person their personal
                        link — switch this off before starting if you'd rather send the links
                        yourself. While a round is open, <strong>Email a reminder</strong> in
                        Invited people emails only those who haven't answered yet.
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
                      Earlier answers are shown only to the person who gave them, through their
                      own personal link.
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
                      Update your name and choose a light or dark appearance in{" "}
                      <strong>Settings</strong>. Settings is available even before you have an
                      organisation.
                    </>
                  ),
                },
                {
                  icon: Building2,
                  text: (
                    <>
                      The <strong>Organisation</strong> panel is where you rename the organisation,
                      manage users and invites, and set titles and permissions — see{" "}
                      <a href="#organisations">Organisations & teams</a>.
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
            </ul>
          </Section>
        </div>
      </article>
    </MarketingShell>
  );
}
