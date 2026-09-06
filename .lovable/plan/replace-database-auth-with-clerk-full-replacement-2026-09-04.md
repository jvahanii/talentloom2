# Replace database auth with Clerk (full replacement)

TalentLoom currently signs users in with the database's built-in auth (email/password, magic link, Google OAuth). This plan replaces all of it with Clerk for both recruiters and candidates, keeps all existing data, and keeps row-level security working by verifying Clerk tokens at the database.

## What you'll need to do (Clerk + database dashboards)

1. In your Clerk dashboard: create a **Supabase JWT template** (Clerk → JWT Templates → New → Supabase). No custom claims needed.
2. In your external database project's dashboard: add Clerk as a **third-party auth provider** (Authentication → Sign In / Providers → Third Party → Add Clerk) using your Clerk domain. This lets the database verify Clerk-issued tokens.
3. Give me your Clerk **publishable key** and **secret key** — I'll store them securely and wire them in.

## How it will work

```text
User signs in with Clerk (recruiter or candidate)
        │
        ▼
Clerk React components (kawaii-themed to match the app)
        │
        ▼
Every database call carries the Clerk session token
        │
        ▼
Database verifies token → RLS resolves Clerk user → profile row (uuid)
```

- The app keeps using `uuid` user ids internally. A new `profiles.clerk_user_id` column maps each Clerk user to their existing/new profile, so all existing organisations, members, candidates, documents and ratings keep working unchanged.
- A SQL helper `current_profile_id()` reads the Clerk token's `sub`, finds the matching profile, and all RLS policies + security-definer functions switch from `auth.uid()` to this helper.
- New users get a profile row created automatically on first sign-in (a small server function upserts the profile from Clerk user data).
- Existing users: their profile gets linked to their Clerk account by email on first Clerk sign-in, so nobody loses their organisations or applications.

## Changes

**New dependencies & secrets**

- `@clerk/clerk-react` (+ `@clerk/backend` for server-side token verification).
- Secrets: `CLERK_SECRET_KEY` (server), publishable key as a `VITE_` env value.

**Auth UI (restyled to the kawaii theme)**

- `/auth` (recruiter) and `/candidate/auth` — replace hand-rolled forms with Clerk `<SignIn>` / `<SignUp>` components, themed with the Mint Soda Pop palette. Magic-link-style email codes and Google sign-in are configured in Clerk (Google is a toggle in the Clerk dashboard).
- Header chips in `MarketingShell` / `AppShell` switch to Clerk's session + `<UserButton>`-style avatar with sign-out.
- `/onboarding` and invite acceptance keep working, driven by the profile lookup instead of the old session.

**Client & server plumbing**

- `src/lib/auth.tsx`, `app-auth-attacher.ts` → attach the Clerk session token (Supabase JWT template) as the bearer on every request.
- `app-auth-middleware.ts` → verify the Clerk token server-side and resolve `userId` via the profile mapping; keep the same `requireSupabaseAuth` interface so no route code changes.
- `_authenticated/route.tsx`, `apply.$orgId.tsx`, candidate portal functions, `accept_invite`, invite page — switch session/profile reads to Clerk + mapping table.
- Remove now-dead code: old signUp/signIn/OAuth calls, password inputs, `supabase.auth` usage in ~25 files.

**Database migration (external project)**

- `profiles.clerk_user_id text unique`, plus `profiles.email` (for invite matching, replacing the `auth.users` email lookup).
- `current_profile_id()` helper; rewrite all RLS policies on every table + storage policies on `candidate-files`, and the security-definer functions (`accept_invite`, `create_organization`, `bump_ai_usage`, `seed_sample_data`, admin-guard triggers) to use it.
- Drop the `handle_new_user` trigger (no longer fires) — profile creation moves to first-sign-in upsert.

**Email invites** keep working: invite acceptance matches the Clerk account's email against the invite email.

## Out of scope / notes

- Old database-auth passwords stop working entirely (full replacement, as chosen).
- Google sign-in moves to Clerk's Google toggle; existing Google users sign in with the same email and get linked automatically.
- I'll verify sign-up, sign-in, org switching, candidate application + documents end-to-end with the browser tool.

## Technical details

- Clerk token verification in server functions uses `@clerk/backend` `verifyToken` with the secret key (Worker-safe, no Node-only APIs).
- The database client is created per request with the Clerk JWT as `Authorization: Bearer`, so PostgREST verifies it via the third-party-auth integration and RLS applies as that user.
- `current_profile_id()` is `stable security definer` and returns `null` when unauthenticated, so anonymous/public reads (job board) behave exactly as today.
