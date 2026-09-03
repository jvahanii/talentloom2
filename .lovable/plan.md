# Fix "Track this application" on the confirmation screen

## What the button is meant to do

After a candidate submits an application, the confirmation card shows "Track this application" only when the candidate is signed in. It should take them to their candidate portal (`/candidate/applications`), where the application they just sent appears in the list with its current stage, alongside their saved CV and cover letter.

If they are not signed in, the card instead offers "Create a free candidate account" — that path is unchanged.

## Why it may not work (unconfirmed)

I could not sign in as a candidate from here, so the exact cause is not confirmed. Two plausible causes, both consistent with "clicking does nothing visible":

1. The portal page checks the session on load and silently sends the visitor back to the sign-in page when the check comes back empty — the candidate ends up on a page that looks like nothing happened.
2. The navigation works, but the just-submitted application is not linked to the account yet, so the portal shows an empty list and the button feels broken.

## Plan

1. Reproduce with a signed-in candidate account: submit an application, click the button, and record the resulting URL, page state, and any console/server errors. This determines which of the two causes applies.
2. If the session check is the problem: make the portal wait for the auth state to settle before deciding to redirect (listen for the auth state change rather than a single one-shot session read), and show a clear "Please sign in to track your applications" state instead of a silent bounce.
3. If the linking is the problem: make the confirmation flow attach the new application to the signed-in candidate at submit time (rather than relying only on the after-the-fact email claim), and pass the new application id through so the portal can highlight it.
4. Make the outcome visible either way: after landing on the portal, scroll/highlight the newly submitted application, and show a friendly empty state when there is nothing to track.
5. Re-verify the full flow end to end: apply while signed in, click the button, confirm the application is listed with the correct company, position and stage.

## Technical notes

- Confirmation card: `src/routes/apply.$orgId.tsx` (the `done` branch, link to `/candidate/applications`).
- Portal: `src/routes/candidate.applications.tsx` — the `useEffect` that calls `supabase.auth.getSession()` and redirects to `/candidate/auth`, gating `sessionChecked`.
- Linking logic: `claimMyApplications` in `src/lib/candidate-portal.functions.ts` matches anonymous applications by email (`ilike`), so a mismatch between the typed email and the account email leaves the application unclaimed.
- No schema change expected; if step 3 is needed, the submit server function stamps the candidate user id when an authenticated session is present.
