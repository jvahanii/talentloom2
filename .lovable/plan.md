# Fix Google sign-in on the Clerk production instance

Google sign-in in TalentLoom is handled entirely by Clerk's `<SignIn>` component, so the app code is fine — the failure is almost certainly in the Google Cloud ↔ Clerk connection. This plan diagnoses the exact error first, then fixes the matching cause.

## Step 1 — Diagnose (I'll do this)

1. Try a Google sign-in in the preview and capture the exact error message/redirect (Clerk shows different errors for each cause).
2. Check the browser console and network log for the failing request.

## Step 2 — Fix (mostly dashboard settings, depending on the diagnosis)

The likely causes, in order of probability:

1. **Wrong redirect URL in Google Cloud Console** (most common)
   - In Google Cloud → APIs & Services → Credentials → your OAuth Client ID → **Authorized redirect URIs**, you must add Clerk's **production** callback URL, which is:
     `https://clerk.talentloom.org/v1/oauth_callback`
   - (The exact value is shown in Clerk dashboard → your production instance → User & Authentication → Social Connections → Google.)
   - A redirect URI from the old dev instance (e.g. `*.clerk.accounts.dev`) will NOT work for production.

2. **OAuth consent screen still in "Testing" mode**
   - In Google Cloud → OAuth consent screen: click **Publish app**. While it's in testing mode, only the test users you listed can sign in; everyone else gets an error.

3. **Missing scopes** — the consent screen needs `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.

4. **Clerk not using the custom credentials**
   - In Clerk → Social Connections → Google, confirm the custom Client ID and Client Secret are saved (not the Clerk development keys).

## Step 3 — Verify

1. Sign in with Google in the preview, confirm the session works and the profile is created/linked.
2. Confirm the signed-in chip appears in the header and `/pipeline` / `/candidate/applications` load without errors.

## Notes

- If the Google consent screen is still unverified by Google, users may see a warning screen before signing in — that's normal until Google finishes verification and doesn't block sign-in.
- No app code changes are expected; only dashboard configuration.
