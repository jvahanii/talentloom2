# Fix: application uploads not saved to My documents

## What's actually wrong

The save-to-My-documents step only runs when the application submission recognises the signed-in candidate. It never does, because the submission handler checks the sign-in token against the **old backend project** instead of the current TalentLoom backend the app was migrated to.

Result: every application is treated as anonymous — no document copy is created in My documents, and the application is not linked to the candidate's account either (it only gets picked up later by the email-matching claim step).

Confirmed by reading the code:

- `src/lib/apply.functions.ts` builds its token-check client from `process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`, which point at the previous backend.
- Every other server function uses `serverSupabaseConfig()` (`EXT_SUPABASE_*`, falling back to the current project) plus `createSupabaseFetch`, which is required for the new `sb_publishable_...` key format to be accepted.

So the token verification fails silently, `applicantUserId` stays null, and the whole signed-in branch (document copy + account linking) is skipped.

## The fix

In `src/lib/apply.functions.ts`, inside `submitApplication`:

1. Build the token-verification client with `serverSupabaseConfig()` and `createSupabaseFetch(publishableKey)` — the same pattern as the rest of the app — instead of the stale `process.env.SUPABASE_*` values.
2. Only treat a header value as a user token when it looks like a JWT (three dot-separated parts), rather than comparing against a publishable key.
3. Verify with `getClaims(token)` and take `claims.sub` as the applicant's user id, matching the shared auth middleware.
4. Keep everything else as-is: anonymous submissions still work when there is no valid token.

## Verification

- Typecheck.
- Query the backend after a signed-in test submission to confirm a new `candidate_documents` row exists and the candidate row has `applicant_user_id` set.
