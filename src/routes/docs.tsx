import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "TalentLoom user guide" }, { name: "description", content: "Learn how to find roles, manage applications, and run your hiring workspace with TalentLoom." }] }),
  component: Docs,
});

function Docs() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="glass rounded-3xl p-6 sm:p-10 prose prose-slate max-w-none">
          <h1 className="font-display">TalentLoom user guide</h1>
          <p className="lead">Everything you need to find a role or run a clear, organised hiring process.</p>

          <h2>For candidates</h2>
          <ol>
            <li>Open <strong>Find a role</strong> to browse public opportunities. Search by title, department, or company, then filter and sort the results.</li>
            <li>Open a position to read its description, dates, and hiring manager, then select <strong>Apply for this position</strong>.</li>
            <li>Submit an application with your contact details and optional CV or cover letter. You can apply without an account.</li>
            <li>Create a candidate account with email, Google, or a magic link to connect past applications, track their stages, and save a shortlist.</li>
            <li>Use <strong>My applications</strong> to upload, label, rename, download, or delete reusable CVs and cover letters.</li>
          </ol>

          <h2>For recruiting teams</h2>
          <ol>
            <li>Sign up with email or Google and complete onboarding with your personal and company details. You can start with sample data or import candidates from CSV.</li>
            <li>Create positions with a department, hiring manager, status, start date, application deadline, public description, internal notes, and attachments.</li>
            <li>Copy a public apply link for your whole organisation or for a specific position.</li>
            <li>Use the <strong>Funnel</strong> board to filter candidates by position or source, add candidates, and move them through Applied, Screen, Interview, Offer, Hired, and Rejected.</li>
            <li>Open a candidate to edit their contact details, position, source, stage, rating, notes, and resume link. Upload or replace a CV and cover letter, review stage history, or delete the record when permitted.</li>
            <li>Use <strong>Candidates</strong> to search the complete workspace by name, email, or position.</li>
            <li>Review <strong>Analytics</strong> for open positions, candidate totals, hires, conversion, funnel stages, source mix, and average time in stage.</li>
            <li>Use <strong>Export</strong> to download candidate or position CSVs, and <strong>Import</strong> to preview, map, and upload candidate CSV data. Download the import template for the supported columns.</li>
          </ol>

          <h2>Workspace settings</h2>
          <ul>
            <li>Update your name, role, company details, and appearance in <strong>Settings</strong>.</li>
            <li>Organisation settings provide workspace branding, members, invitations, and role-based permissions where enabled.</li>
            <li>Clear sample candidates and positions without affecting your own data.</li>
            <li>LinkedIn, Indeed, and ATS connections are marked <strong>Coming soon</strong>; CSV import is available now.</li>
          </ul>

          <h2>Good to know</h2>
          <ul>
            <li>The public job board and apply pages are available without sign-in. Recruiter tools require a recruiter account; application history and saved documents require a candidate account.</li>
            <li>Funnel drag-and-drop is designed for desktop. On touch devices, use the stage selector on the candidate record.</li>
            <li>Candidate files accept PDF, DOC, and DOCX files up to 10 MB. Secure file links expire after one hour.</li>
            <li>Workspace data is isolated by organisation and protected by row-level security.</li>
          </ul>
        </div>
      </article>
    </MarketingShell>
  );
}
