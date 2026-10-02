import { createFileRoute } from "@tanstack/react-router";
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
  Activity,
  Users,
  Star,
  TrendingUp,
  MessagesSquare,
  Link2,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Talentloom & Pulse user guide" },
      {
        name: "description",
        content:
          "Learn how to apply for roles, manage hiring, and run recurring surveys and structured interviews with Talentloom Pulse.",
      },
      { property: "og:title", content: "Talentloom & Pulse user guide" },
      { property: "og:description", content: "A practical guide to candidate applications, organisation hiring and Talentloom Pulse surveys." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
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
  icon: Icon,
  title,
  blurb,
  children,
}: {
  icon: LucideIcon;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass pop-in rounded-3xl p-6 sm:p-8">
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
            Find a role, run your organisation’s hiring, or follow responses over time with Pulse.
          </p>
        </header>

        <div className="mt-8 grid gap-6">
          <Section icon={Search} title="For candidates" blurb="From browsing to landing the role.">
            <StepList
              steps={[
                {
                  icon: Search,
                  text: (
                    <>
                      Open <strong>Find a role</strong> to browse public positions. Search by keyword,
                      filter by company, and sort by newest, rating, deadline, or company.
                    </>
                  ),
                },
                {
                  icon: FileText,
                  text: (
                    <>
                      Open a position to read its description and dates, then
                      select <strong>Apply for this position</strong>.
                    </>
                  ),
                },
                {
                  icon: Send,
                  text: (
                    <>
                      Submit your contact details and optional CV or cover letter. You can apply
                      without an account; signed-in candidates go straight to <strong>My applications</strong>.
                    </>
                  ),
                },
                {
                  icon: UserRound,
                  text: (
                    <>
                      Sign in as a candidate to see your applications and their stages. Rate
                      positions from 1–5 stars, sort by rating, or discard and restore positions;
                      use the Active, Rated, and Discarded views to organise your search.
                    </>
                  ),
                },
                {
                  icon: FolderHeart,
                  text: (
                    <>
                      Open <strong>My applications</strong> to view submitted documents and stages.
                      In <strong>My documents</strong>, save, label, rename, open, or delete CVs and
                      cover letters for reuse when applying.
                    </>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            icon={Building2}
            title="For recruiting teams"
            blurb="One shared candidate flow for your team."
          >
            <StepList
              steps={[
                {
                  icon: UserRound,
                  text: (
                    <>
                      Create an account, create an organisation or join one with an invite, and
                      choose it from the organisation switcher. Import candidates from CSV if needed.
                    </>
                  ),
                },
                {
                  icon: Building2,
                  text: (
                    <>
                      In <strong>Positions</strong>, create a position with details, a start date,
                      application deadline, description, notes, and attachments. Download all
                      applicants’ attachments for a position as a ZIP file.
                    </>
                  ),
                },
                {
                  icon: KanbanSquare,
                  text: (
                    <>
                      Use <strong>Candidate flow</strong> to filter candidates by position or
                      source, add candidates, and move them through Applied, Screen, Interview,
                      Offer, Hired, and Rejected.
                    </>
                  ),
                },
                {
                  icon: FileText,
                  text: (
                    <>
                      Open a candidate to edit their contact details, position, source, stage,
                      rating, and notes. Upload or replace a CV and cover letter,
                      review stage history, or delete the record when permitted.
                    </>
                  ),
                },
                {
                  icon: Search,
                  text: (
                    <>
                      Use <strong>Candidates</strong> to search the complete workspace by name,
                      email, or position.
                    </>
                  ),
                },
                {
                  icon: BarChart3,
                  text: (
                    <>
                      Review <strong>Analytics</strong> for open positions, candidate totals, hires,
                      conversion, funnel stages, source mix, and average time in stage.
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
                {
                  icon: Sparkles,
                  text: <><strong>Ask</strong> lets authorised team members ask questions about their hiring data in plain language.</>,
                },
              ]}
            />
          </Section>

          <Section icon={Settings2} title="Organisation settings" blurb="Manage your account and team.">
            <StepList
              steps={[
                {
                  icon: Settings2,
                  text: (
                    <>
                      Update your profile, organisation details, and appearance in{" "}
                      <strong>Settings</strong>.
                    </>
                  ),
                },
                {
                  icon: Building2,
                  text: (
                    <>
                      Manage members and titles in Organisation settings. Owner, Admin, and Member
                      are the built-in titles; the Owner stays protected. Permission checkboxes
                      control which team members can use each hiring tool.
                    </>
                  ),
                },
                {
                  icon: Link2,
                  text: <>Invite a teammate by email from Organisation settings, or copy an invite link. Email-specific links can only be used by that person; invitations expire after seven days.</>,
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
              ]}
            />
          </Section>

          <Section icon={Activity} title="Talentloom Pulse" blurb="Surveys and structured interviews over time.">
            <StepList steps={[
              {
                icon: Activity,
                text: <>Open <strong>Pulse surveys</strong> and select <strong>New survey</strong>. Enter a title and choose a self-completed survey or a structured interview. You can use Pulse without joining an organisation.</>,
              },
              {
                icon: Users,
                text: <>In <strong>Who owns it</strong>, you always keep access as creator. You can also share access with all your organisations, selected organisations, and invited users by email. Combine organisation sharing with invited users; they can see and edit after signing in. Sharing access does not itself invite someone to answer.</>,
              },
              {
                icon: Star,
                text: <>In <strong>Questions</strong>, add and reorder 1–5 ratings, rating with optional reason, single or multiple choice, free text, and yes/no questions. Mark questions required as needed, then save. Keep the wording stable between rounds for meaningful comparisons.</>,
              },
              {
                icon: Link2,
                text: <>For surveys, choose <strong>Anyone with the link</strong>, <strong>Invited people only</strong>, or <strong>Both</strong>. Add respondents in <strong>Invited people</strong> (name and email, or email only), then copy and send each personal link yourself. The same personal link works across rounds. A public link is available from an open round when link answering is enabled.</>,
              },
              {
                icon: Clock3,
                text: <>In <strong>Rounds & sharing</strong>, start a round after saving questions and optionally set a closing date. Starting another round closes the current one; you can also close or reopen a round. For interviews, add interviewees and record their answers in <strong>Run interview</strong> during an open round.</>,
              },
              {
                icon: TrendingUp,
                text: <>Use <strong>Results</strong> to compare rounds: rating averages and changes, yes/no percentages, choice distributions, latest written answers, and per-person rating movement where available. Shared organisations see the same combined results, not separate results per organisation.</>,
              },
              {
                icon: MessagesSquare,
                text: <>Invited signed-in respondents with an unanswered open survey see it under <strong>Waiting for your answer</strong> in Pulse surveys. If enabled in survey <strong>Settings</strong>, their personal link shows their own earlier answers beneath each question, newest first; ratings also show a trend when enough answers exist. Public-link answers do not show personal history.</>,
              },
            ]} />
          </Section>

          <Section icon={Sparkles} title="Good to know" blurb="Handy facts before you dive in.">
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <Fact
                icon={ShieldCheck}
                text={
                  <>
                    The public job board and apply pages work without sign-in. Recruiter tools
                    require a recruiter account; application history requires a candidate account.
                  </>
                }
              />
              <Fact
                icon={Smartphone}
                text={
                  <>
                    Candidate flow drag-and-drop is designed for desktop. On touch devices, use the stage
                    selector on the candidate record.
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
                    Workspace data is isolated by organisation and protected by row-level security.
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
