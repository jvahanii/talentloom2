# Preview-only access to signed-in pages for visual edits

## Goal
Let you open any page in the Lovable preview without signing in, so you can do visual edits on the recruiter app, candidate pages, and Pulse survey pages.

## Approach
Add a **preview-only design mode** that skips the sign-in gate. It turns on automatically only in the Lovable preview/editor — never on the published site (talentloom.org).

1. **Bypass the sign-in gate in preview** (`src/routes/_authenticated/route.tsx`)
   - When running on a Lovable preview host (the `*.lovable.app` / `*.lovableproject.com` preview URL) and no Clerk session exists, skip the redirect to `/auth` and the profile/org checks, and render the page with a mock "Preview user" profile instead.
   - On the real published domain nothing changes — sign-in is still required.

2. **Let pages render without data**
   - Pages load their data through server functions that require a real sign-in token, so in design mode those calls will simply fail quietly and pages show their empty states (empty candidate flow, empty survey list, etc.). That's enough for visual/layout edits.
   - Where a page hard-fails without a profile, catch the error in design mode and render the page shell.

3. **Candidate pages** (`/candidate/applications`, `/apply/*`)
   - `/apply/*` pages are already public. `/candidate/applications` checks for a Clerk session; give it the same preview-only bypass so it renders.

## Technical details
- Detection: check `location.hostname` against the Lovable preview zones (same list already used in `previewAuthStorage.ts`), plus `import.meta.env.DEV`. The published custom domain and `talentloom2.lovable.app` published URL are not preview hosts, so the bypass never applies there. Note: the published URL `talentloom2.lovable.app` shares the `lovable.app` zone — to be safe, the bypass requires the `id-preview--` / `project--` host pattern (editor preview), not just the zone.
- No database changes. No changes to Clerk or server functions.
- Files touched: `src/routes/_authenticated/route.tsx`, `src/routes/candidate.applications.tsx` (and a small shared helper, e.g. `src/lib/preview-design-mode.ts`).

## Limitations
- Pages will show empty/placeholder states since no real data loads without a signed-in account.
- If you later want preview access removed, it's a one-line change.
