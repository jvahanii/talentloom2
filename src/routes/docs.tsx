import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
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
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "TalentLoom user guide" }, { name: "description", content: "Learn how to find roles, manage applications, and run your hiring workspace with TalentLoom." }] }),
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
          <div className="bob mx-auto grid h-16 w-16 place-items-center rounded-3xl border-2 border-primary bg-accent text-3xl shadow-[0_4px_0_var(--brand-bubblegum)]">
            ˘ᴗ˘
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
            TalentLoom <span className="text-duotone">user guide</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Everything you need to find a role or run a clear, organised hiring process — explained step by step.
          </p>
        </header>

        <div className="mt-8 grid gap-6">
          <Section icon={Search} title="For candidates" blurb="From browsing to landing the role.">
            <StepList
              steps={[
                { icon: Search, text: <>Open <strong>Find a role</strong> to browse public opportunities. Search by title, department, or company, then filter and sort the results.</> },
                { icon: FileText, text: <>Open a position to read its description, dates, and hiring manager, then select <strong>Apply for this position</strong>.</> },
                { icon: Send, text: <>Submit an application with your contact details and optional CV or cover letter. You can apply without an account.</> },
                { icon: UserRound, text: <>Create a candidate account with email, Google, or a magic link to connect past applications, track their stages, and save a shortlist.</> },
                { icon: FolderHeart, text: <>Use <strong>My applications</strong> to upload, label, rename, download, or delete reusable CVs and cover letters.</> },
              ]}
            />
          </Section>

          <Section icon={Building2} title="For recruiting teams" blurb="One shared funnel for your whole team.">
            <StepList
              steps={[
                { icon: UserRound, text: <>Sign up with email or Google and complete onboarding with your personal and company details. Start with sample data or import candidates from CSV.</> },
                { icon: Building2, text: <>Create positions with a department, hiring manager, status, start date, application deadline, public description, internal notes, and attachments.</> },
                { icon: KanbanSquare, text: <>Use the <strong>Funnel</strong> board to filter candidates by position or source, add candidates, and move them through Applied, Screen, Interview, Offer, Hired, and Rejected.</> },
                { icon: FileText, text: <>Open a candidate to edit their contact details, position, source, stage, rating, notes, and resume link. Upload or replace a CV and cover letter, review stage history, or delete the record when permitted.</> },
                { icon: Search, text: <>Use <strong>Candidates</strong> to search the complete workspace by name, email, or position.</> },
                { icon: BarChart3, text: <>Review <strong>Analytics</strong> for open positions, candidate totals, hires, conversion, funnel stages, source mix, and average time in stage.</> },
                { icon: Download, text: <>Use <strong>Export</strong> to download candidate or position CSVs, and <strong>Import</strong> to preview, map, and upload candidate CSV data. Download the import template for the supported columns.</> },
              ]}
            />
          </Section>

          <Section icon={Settings2} title="Workspace settings" blurb="Make the workspace yours.">
            <StepList
              steps={[
                { icon: Settings2, text: <>Update your name, role, company details, and appearance in <strong>Settings</strong>.</> },
                { icon: Building2, text: <>Organisation settings provide workspace branding, members, invitations, and role-based permissions where enabled.</> },
                { icon: Sparkles, text: <>Clear sample candidates and positions without affecting your own data.</> },
                { icon: Clock3, text: <>LinkedIn, Indeed, and ATS connections are marked <strong>Coming soon</strong>; CSV import is available now.</> },
              ]}
            />
          </Section>

          <Section icon={Sparkles} title="Good to know" blurb="Handy facts before you dive in.">
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <Fact icon={ShieldCheck} text={<>The public job board and apply pages work without sign-in. Recruiter tools require a recruiter account; application history requires a candidate account.</>} />
              <Fact icon={Smartphone} text={<>Funnel drag-and-drop is designed for desktop. On touch devices, use the stage selector on the candidate record.</>} />
              <Fact icon={FileText} text={<>Candidate files accept PDF, DOC, and DOCX up to 10 MB. Secure file links expire after one hour.</>} />
              <Fact icon={ShieldCheck} text={<>Workspace data is isolated by organisation and protected by row-level security.</>} />
            </ul>
          </Section>
        </div>
      </article>
    </MarketingShell>
  );
}
