# Complete Clerk ↔ Supabase shared-secret (HS256) setup

TalentLoom already sends Clerk session tokens to the external Supabase database. With shared HS256, Supabase will trust those tokens because both Clerk and Supabase use the same signing secret.

## What you will do in the Clerk dashboard

1. Open the **Supabase** JWT template in Clerk (JWT Templates → supabase).
2. Set **Signing algorithm** to **HS256**.
3. Paste your external Supabase project's **JWT secret** into the **Custom signing key** field.
4. Save the template. No custom claims are needed — the default `sub` claim is enough.

Where to find the Supabase JWT secret: Project Settings → API → JWT Settings → JWT Secret (in your external Supabase project dashboard). Do not paste it in chat.

## What I will verify in the app

1. Confirm the database already has `current_profile_id()` and that RLS policies / security-definer functions resolve the Clerk `sub` claim to a `profiles.id`.
2. Confirm `profiles.clerk_user_id` exists and is indexed/unique.
3. Make sure the Clerk JWT template name in code (`src/lib/clerk.ts`) matches the dashboard template name (`supabase`).
4. Run a typecheck/build to ensure nothing is broken.

## Testing

1. Sign out of the preview, then sign in as a recruiter.
2. Verify the profile is created or linked and the app loads `/funnel` without permission errors.
3. Sign in as a candidate and verify `/candidate/applications` works.
4. If any route returns "Unauthorized" or a permission error, the likely cause is the Supabase third-party auth / JWT secret configuration, and we will debug from the browser/network logs.

## Out of scope

- Rotating the Supabase JWT secret (can be done later if needed).
- Switching to RS256/JWKS later (possible, but requires a separate plan).
