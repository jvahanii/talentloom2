# Switch Clerk from test instance to production instance

TalentLoom currently signs users in through a Clerk **development** instance (key starts with `pk_test_...`). This plan switches the app to your Clerk **production** instance (`pk_live_...`) so the published site at talentloom.org works properly.

## What you do in the Clerk dashboard

1. In Clerk, switch to your **production** instance (or create one from your existing application).
2. In the production instance, recreate the **Supabase JWT template** (JWT Templates → New → Supabase):
   - Name it exactly `supabase`
   - Algorithm **HS256**
   - Paste your external database project's **JWT secret** as the custom signing key (same one you used in the test instance — the database side does not change)
3. Enable the same sign-in methods you use today (email, Google if you had it).
4. Give me the production instance's **publishable key** (`pk_live_...`) and **secret key** (`sk_live_...`) — I'll store the secret securely and wire the publishable key into the app.

## What I will change in the app

1. `src/lib/clerk.ts` — replace the hardcoded test publishable key fallback with the new `pk_live_...` key.
2. Store the new `CLERK_SECRET_KEY` (used server-side to verify tokens) via the secure secret store.
3. Verify no other test-instance references remain.
4. Republish is not strictly required for the preview, but the published site picks it up on next publish.

## Important notes

- **User accounts do not carry over.** Accounts created on the test instance stay there. Everyone (including you) signs up fresh on the production instance; profiles are auto-created/linked by email on first sign-in, so organisation data in the database is re-linked automatically when the email matches.
- The database and its security rules do not change — only which Clerk instance issues the tokens.
- If you want, I can verify sign-up and sign-in end-to-end after the switch.

## Out of scope

- Migrating existing test-instance users into production (Clerk offers export/import; only needed if you have real users to preserve).
