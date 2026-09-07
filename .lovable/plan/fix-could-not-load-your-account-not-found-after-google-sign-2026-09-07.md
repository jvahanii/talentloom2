# Fix "Could not load your account: Not Found" after Google sign-in

## What is happening

Sign-in with Google succeeds, but the app then fails to look up your account and shows the error screen.

The cause is confirmed: the site's public sign-in settings point to your **production** Clerk instance, while the private server key still belongs to the **test** Clerk instance. When the server asks Clerk about the freshly signed-in user, the test instance has never heard of them and replies "Not Found".

## What is needed from you

The **production** secret key from Clerk (starts with `sk_live_`). Find it in the Clerk dashboard with the production instance selected, under API keys.

## Steps

1. You provide the production secret key through a secure form (it is never shown in chat or stored in code).
2. Replace the stored test key with it.
3. Confirm the production Clerk instance has the `supabase` JWT template configured (HS256, signed with the database JWT secret) — sign-in fails at the backend without it.
4. Re-test: sign in with Google, land on onboarding, create an organisation, and confirm the recruiter area loads.
5. Publish so talentloom.org picks up the change.

## Technical notes

- Frontend uses `pk_live_…` (`clerk.talentloom.org`); the sandbox currently holds `CLERK_SECRET_KEY` with an `sk_test_` prefix.
- The failure surfaces in `provisionProfileForClerkUser` → `clerk.users.getUser(clerkUserId)` in `src/integrations/supabase/clerk-sync.server.ts`, whose 404 is reported by `src/routes/_authenticated/route.tsx`.
- Token verification itself passes because the HS256 path validates against the shared Supabase JWT secret, which is instance-independent — so only the Clerk Backend API call fails.
- No code changes are expected; this is a credentials swap.
