# Candidate job board: browse open positions and apply

Turn the candidate side into a real job board: every open position across all companies is listed, each has its own description page, and candidates apply straight from it.

## 1. Job description field

Requisitions get a new public **Description** field (separate from internal Notes, which stays private).

- Positions page: recruiters add/edit a description when creating or editing a position.
- Only the description is ever shown publicly — internal notes are never exposed.

## 2. Job board at `/apply`

Replaces the current company list.

- Lists all open positions across all organisations: title, company, department, target start date.
- Search box (title / company / department) and a company filter, kept in the URL so results are shareable.
- Empty state when nobody is hiring.
- Each card links to the position page.

## 3. Position page at `/apply/position/$id`

- Full detail: title, company, department, hiring manager, target start date, description.
- "Apply for this position" button leading to the application form with the role pre-selected.
- Own page metadata (title/description) so individual jobs can be shared and indexed.

## 4. Company page and apply form

- `/apply/$orgId` keeps working; it now shows the company's open positions with their descriptions and an apply button per role.
- The existing application form (name, email, phone, role, source, notes, CV + cover letter) is unchanged, just reachable with the role pre-filled.

## Technical notes

- Migration: add `description text` to `public.requisitions`. No RLS change — public reads go through server functions only.
- New public server functions in `src/lib/apply.functions.ts` (service-role, public-safe projections only):
  - `listOpenPositions` — open requisitions joined to org name; returns id, title, org id/name, department, target start date, short description excerpt.
  - `getPosition({ id })` — one open position with full description + company name; returns null if missing or not open.
  - `getApplyContext` extended to return role descriptions.
- New route `src/routes/apply.position.$id.tsx`; `src/routes/apply.tsx` rewritten as the board with `validateSearch` for `q` and `org`.
- Recruiter UI: description textarea in the requisition create/edit form on `src/routes/_authenticated/requisitions.tsx` (and the workspace `RequisitionPanel` insert path).
- Verification: Playwright run over `/apply` → position page → apply form submission.
