# Persist candidate board selections to the database

Today on the candidate positions page (`/apply`), star ratings and discards are already saved per candidate in the database. The other selections — search text, company filter, sort order and the Active/Rated/Discarded view — live only in the page URL, so they are lost when the candidate comes back later or opens the board on another device.

This change saves those selections too, per signed-in candidate.

## Behaviour

- When a signed-in candidate changes search, company, sort or view, the choice is saved automatically (debounced, no save button).
- On the next visit to `/apply` with no filters in the URL, the saved selections are restored and reflected back into the URL.
- If the URL already carries filters (shared or bookmarked link), the URL wins for that visit and is then saved as the new preference.
- Signed-out visitors keep today's behaviour: URL-only, nothing stored.
- A small "Reset filters" action clears the saved selections back to defaults.
- The position detail page needs no change.

## Data

New table `candidate_board_prefs` on the backend project:

- one row per candidate (their user id is the key)
- stored fields: search text, selected company, sort option, view option, plus created/updated timestamps
- access rules: a candidate can only read, create and change their own row; nobody else can see it

## Technical notes

- Table created on the external Supabase project via SQL (same path as `candidate_position_ratings`): `user_id uuid primary key`, `q text`, `org_id uuid`, `sort text`, `view text`, `created_at`/`updated_at`, grants to `authenticated`, RLS scoped to `auth.uid()`, and the existing updated-at trigger.
- New server functions in `src/lib/candidate-board-prefs.functions.ts` using `requireSupabaseAuth`: `getMyBoardPrefs` and `saveMyBoardPrefs` (upsert on `user_id`). Local interfaces + casts, since generated types don't know the table.
- New hook `src/hooks/useBoardPrefs.tsx`: fetches prefs with React Query when a session exists, exposes `prefs`, `ready`, and a debounced (~600ms) `save`. Failures are silent (a toast on every keystroke would be noisy); only an explicit reset toasts.
- `src/routes/apply.index.tsx`: on first load, when prefs are ready and the URL has no `q`/`org`/`sort`/`view`, `navigate({ search, replace: true })` with the saved values. Every filter change calls `save`. Values are validated/clamped against the existing `SORTS`/`VIEWS` lists before use.
- Restore runs once per mount guarded by a ref, so it never fights user edits or loops.
