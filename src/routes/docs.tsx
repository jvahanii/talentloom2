import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Docs — TalentLoom" }, { name: "description", content: "How TalentLoom works, getting started, and remix instructions." }] }),
  component: Docs,
});

function Docs() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="glass rounded-3xl p-6 sm:p-10 prose prose-slate max-w-none">
          <h1 className="font-display">TalentLoom docs</h1>
          <p className="lead">A single-user recruiting pipeline template. Everything you need to hire a team without a $500/mo ATS.</p>

          <h2>How it works</h2>
          <ul>
            <li><strong>Positions</strong> are the roles you're hiring for.</li>
            <li><strong>Candidates</strong> belong to a position and move through stages: Applied → Screen → Interview → Offer → Hired (or Rejected).</li>
            <li><strong>Pipeline board</strong> is your default view — one column per stage.</li>
            <li><strong>Analytics</strong> summarises funnel conversion, time-in-stage, and source mix.</li>
          </ul>

          <h2>Getting started</h2>
          <ol>
            <li>Sign up with email or Google.</li>
            <li>Complete the 3-step onboarding: <strong>Personal info</strong> (full name, role) → <strong>Company info</strong> (name, industry, size) → <strong>Bring in data</strong> (import your candidates via CSV, or start with sample data). Onboarding is resumable — if you leave and come back, you land on the last step you completed.</li>
            <li>Add or edit positions and drop candidates into stages on the Pipeline board.</li>
            <li>If you chose sample data, clear it from Settings when you're done exploring. You can edit your profile fields there anytime.</li>
          </ol>

          <h2>Remix instructions</h2>
          <p><strong>What carries over on remix:</strong> the schema (positions, candidates, stage history, profiles), row-level security policies, auth configuration, and the seed function.</p>
          <p><strong>What does NOT carry over:</strong> your candidate and position data. Each remix gets a fresh backend.</p>

          <h2>Known gaps</h2>
          <ul>
            <li>Live LinkedIn / Indeed / ATS connectors are placeholders — the Settings page marks them "Coming soon". Import your data via CSV instead.</li>
            <li>Drag-and-drop on the pipeline board works on desktop. Touch devices use the stage dropdown.</li>
            <li>No email notifications, no team invites — this is intentionally single-user.</li>
            <li>Resume storage is a link field, not file upload.</li>
          </ul>

          <h2>Security model</h2>
          <p>Every table is scoped strictly by <code>auth.uid()</code>. There is no admin/member split and no organisation concept — one user, one workspace. All SECURITY DEFINER functions have a pinned <code>search_path</code> and are restricted from anonymous callers.</p>
        </div>
      </article>
    </MarketingShell>
  );
}
