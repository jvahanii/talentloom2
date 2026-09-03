# Candidate job board: rate, sort and discard positions

Signed-in candidates get a private shortlist layer on the open-positions board: 1-5 stars per position, sorting options, and the ability to discard positions they are not interested in. Ratings and discards are private to the candidate — recruiters never see them.

## What the candidate gets

On `/apply` (open positions list):
- A star row (1-5) on every position card. Clicking a star saves it instantly; clicking the same star again clears the rating.
- A "Discard" action on each card that hides the position from the list.
- A sort control: Newest (default), Highest rated, Lowest rated, Deadline soonest, Company A-Z.
- A filter toggle: Active positions (default) / Rated only / Discarded. From the Discarded view a position can be restored.
- Existing search and company filter keep working; sort and view are kept in the URL so the board can be shared/bookmarked.

On `/apply/position/$id` (position detail): the same star row plus discard/restore, so a candidate can rate while reading the description.

Signed-out visitors see the stars greyed out with a short "Sign in to rate and shortlist positions" prompt linking to the candidate sign-in page. The board itself stays public and fully browsable.

## Data

New table `candidate_position_ratings` on the external database:
- candidate user, position, rating (1-5, optional), discarded flag, timestamps
- one row per candidate + position
- access rules: a candidate can only read, create, change and remove their own rows; nobody else, including recruiters, can read them.

## Technical notes

- Table is created directly on the external Supabase project (the app's live database) via SQL, same as the earlier `deadline_date` change, with grants to `authenticated` and RLS policies scoped to `auth.uid()`. Cascade delete on position removal.
- New server functions in `src/lib/candidate-ratings.functions.ts` using `requireSupabaseAuth`: `listMyPositionRatings`, `setPositionRating` ({ positionId, rating|null }), `setPositionDiscarded` ({ positionId, discarded }). Auth-only, so they are called from components via `useServerFn` + React Query, never from a public loader.
- `/apply` and `/apply/position/$id` stay public and SSR-rendered: positions load as today; the ratings query is client-side and enabled only when a candidate session exists (reuse the existing candidate auth check used by `candidate.applications.tsx`).
- Merge ratings into the position list client-side, then apply view filter and sort. Optimistic updates on star click and discard, with rollback on error and a sonner toast on failure.
- New presentational `StarRating` component (`src/components/StarRating.tsx`) in the kawaii style: bubblegum-filled stars, squishy hover, keyboard accessible with aria-labels.
- Search params extended: `sort` and `view` via `validateSearch` with plain string + defaults, clamped in the component.
- Generated Supabase types do not know the new table, so the server functions use local interfaces and casts, matching the existing `deadline_date` pattern.
