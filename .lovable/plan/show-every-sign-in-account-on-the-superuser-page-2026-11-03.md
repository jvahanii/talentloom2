# Show every sign-in account on the Superuser page

## Why some users are missing
The Superuser page lists only accounts saved in the app's own user records. A person gets that record the first time they open the recruiter side. Someone who signed up but never got that far (for example a candidate who signed in only on the candidate side, or someone who left during sign-up) has a sign-in account but no app record. So the page doesn't show them.

Checked now: there are 9 sign-in accounts and 8 app records. One account, created 2026-10-07, has no record, so it is the one missing from the page.

## Fix
1. **Superuser page:** also fetch every sign-in account and merge it into the list. Accounts with no app record show a "Signed up, never opened the app" badge, with their email, name and sign-up date.
2. **Add a record button:** on those rows, a "Create profile" action creates the missing app record. After that you can add the person to organisations like anyone else.
3. **Candidate side:** create the app record the first time someone signs in on the candidate side, so new accounts don't go missing again.
4. **Backfill:** create the missing record for the one account above.

## Technical details
- `getAdminOverview` (src/lib/admin.functions.ts): call Clerk `users.getUserList` with pagination, left-join on `profiles.clerk_user_id`, and return `profileId: null` rows for unmatched accounts.
- New superuser-only server fn `createProfileForClerkUser(clerkUserId)`, which inserts into `profiles` through the admin client after an `is_superuser` check.
- Candidate auth flow calls the existing `ensureMyProfile` after sign-in.
- One-off backfill insert into the external database.
- A small test for the merge (one unmatched Clerk user means one extra row flagged with no profile).
