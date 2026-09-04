# Fix "Something went wrong" on recruiter pages

Signing in as a recruiter and opening a recruiter page (e.g. `/pipeline`) shows the generic error card instead of the app.

## What we know so far

- The route exists and the server returns 200 for every request, so this is a client-side failure, not a missing page.
- The recruiter layout runs a gate before rendering: it waits for the sign-in session, then calls a server function that creates/links the user profile. If that call throws, the whole subtree falls back to the generic "Something went wrong" card — with no message about what failed.
- The error card gives no diagnostics, and no runtime error was captured, so the exact cause is still unconfirmed. The most likely candidate is the session token being rejected server-side (JWT template name / shared signing secret mismatch from the Clerk setup that is still in progress), but that must be confirmed before claiming it as the cause.

## Step 1 — Make the failure visible

Change the recruiter gate so failures are diagnosable instead of silent:

- Log the real error (message + cause) when the profile call fails.
- Distinguish two cases:
  - **Not signed in / token rejected** → redirect to the sign-in page instead of throwing.
  - **Anything else** → throw with the real message so the error card can show it.
- Show the underlying error message on the error card (small, muted text) instead of only "An unexpected error occurred".

## Step 2 — Harden the token handoff

- When the session exists but the JWT template returns no token, retry briefly rather than sending an unauthenticated request; if still empty, treat it as signed-out and redirect to sign-in.
- On the server side, make the token-verification failure message specific (missing header vs. invalid signature vs. wrong template) so the logs name the actual problem.

## Step 3 — Confirm and fix the root cause

With the real message in hand:

- If it is a signature/verification failure, the fix is on the dashboard side: the Clerk JWT template must be named `supabase` and its HS256 custom signing key must equal the database JWT secret.
- If it is a database permission error instead, the fix is in the policies/grants for the recruiter tables.

## Verification

- Typecheck.
- Reload `/pipeline` while signed in as a recruiter and confirm either the page loads or the error card names the precise failure.
