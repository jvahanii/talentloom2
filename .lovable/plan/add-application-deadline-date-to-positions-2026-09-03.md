# Add application deadline date to positions

Add a **Deadline** date field to positions (requisitions), editable by recruiters and shown to candidates on the job board.

## 1. Database

- Migration on the external Supabase project: add `deadline_date date` (nullable) to `public.requisitions`. No RLS or grant changes needed — the table and policies already exist.

## 2. Recruiter UI

- `src/routes/_authenticated/requisitions.tsx` (ReqDialog): add a "Application deadline" date input next to "Target start"; include `deadline_date` in the create/update payload; show the deadline on position cards when set.
- `src/components/workspace/modules/RequisitionPanel.tsx`: same date field and payload update for the AI workspace panel.

## 3. Candidate-facing pages

- `src/lib/apply.functions.ts`: include `deadline_date` in the public projections returned by `listOpenPositions`, `getPosition`, and `getApplyContext`.
- `src/routes/apply.index.tsx` (job board): show "Apply by {date}" on each position card when set.
- `src/routes/apply.position.$id.tsx` (position detail): show the deadline prominently near the apply button.
- Deadline is informational only — no automatic closing of applications when it passes (can be added later if wanted).

## Technical notes

- Migration goes through the external project's DB connection (Session Pooler) since the app now runs on the external Supabase project; Lovable Cloud backup is left untouched.
- Regenerated types are not needed — code uses loose interfaces; add `deadline_date: string | null` to the local `Req` types.
- Verification: typecheck + quick check that a position with a deadline renders it on `/apply`.
