# Front page with Recruiter / Candidate choice

## Goal
Rework the home page (`/`) so the first thing a visitor does is pick their role: **Recruiter** or **Candidate** — each path leading to the right place.

## Changes

### 1. Home page hero — role picker (`src/routes/index.tsx`)
- Keep the existing hero image/branding, but replace the single "Start now" button with two large choice cards side by side (stacked on mobile):
  - **I'm a Recruiter** — "Sign in to manage your pipeline, requisitions and team." → `/auth`
  - **I'm a Candidate** — "Browse open roles and apply with your CV." → `/apply`
- Keep the "How it works" and FAQ sections below (update FAQ copy: replace the outdated "single user workspace" answer with organisation/multi-tenant wording).

### 2. Candidate directory page (`src/routes/apply.tsx`, new)
- Public page at `/apply` listing every organisation that currently has **open requisitions**.
- Each card: organisation name, number of open roles, "View roles & apply" button → existing `/apply/$orgId` page.
- Data via a new public server function `listOpenOrganizations` in `src/lib/apply.functions.ts` (service-role read of orgs joined with open requisitions; returns only org name + role count — no sensitive data).

### 3. Small polish
- Add `head()` metadata to the new `/apply` route (title "Find a role — Talently", description, og tags).
- Empty state on `/apply` when no organisations are hiring yet.

## Technical details
- No database changes; reuses `organizations` + `requisitions` tables and the existing `/apply/$orgId` application flow.
- New public server function follows the same pattern as `getOrgOpenRoles` (service role, public-safe projection).
- Routes: `/` (modified), `/apply` (new), `/apply/$orgId` (unchanged).

## Verification
- Playwright: load `/`, click each card, confirm recruiter path reaches `/auth` and candidate path lists orgs and links into the existing application form.
