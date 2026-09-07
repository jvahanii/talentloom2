# Sign-in still failing: Clerk certificate not issued yet

## What is happening

The DNS side is now done — `clerk.talentloom.org` and `accounts.talentloom.org` resolve correctly to Clerk. But when the browser tries to load Clerk's sign-in script from `clerk.talentloom.org`, the connection is rejected with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`.

That error means the address exists but has **no valid security certificate yet**. Clerk issues that certificate automatically after it verifies the DNS records; it usually takes a few minutes, occasionally up to an hour. Until it lands, the sign-in box cannot render (which is why the candidate sign-in page shows only the heading and no form).

No code changes are needed. The publishable key already points at `clerk.talentloom.org`, and the rest of the app is ready.

## Steps

1. In the Clerk dashboard (production instance) open **Configure → Domains**. Check the **SSL / certificate** status next to `clerk.talentloom.org` and `accounts.talentloom.org`. It should move from "Issuing" to "Active".
2. If it is still not active after ~30 minutes, click **Run verification again** on the Domains page — this nudges Clerk to re-check DNS and retry the certificate.
3. Once Clerk shows the domains as Active, reload the preview and open **Candidate sign in**. The sign-in form (including the Google button) should appear.
4. After sign-in works on the preview, publish so talentloom.org picks up the production Clerk instance.

## Optional follow-ups (only if needed)

- The email DKIM record `clk1._domainkey` had not propagated at last check — this only affects Clerk-sent emails (verification codes, password resets), not the sign-in form itself. Re-run verification once more in Clerk if it stays orange.
- If Google sign-in specifically fails after the form appears, confirm in Google Cloud that the authorised redirect URI is exactly the one shown on Clerk's Google connection page for the production instance.

## Technical details

- Verified from the sandbox: `clerk.talentloom.org` → 104.18.34.146 (Clerk/Cloudflare), TLS handshake fails (`handshake failure`), browser reports `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` when fetching `clerk.browser.js`.
- Cause: no certificate provisioned yet for the custom Clerk frontend API domain. This is entirely Clerk-side provisioning; the app's `VITE_CLERK_PUBLISHABLE_KEY` (`pk_live_…` → `clerk.talentloom.org`) is correct.
- Verification after Clerk activates: load `/candidate/auth` and confirm the Clerk `<SignIn>` widget renders with no failed requests to `clerk.talentloom.org`.
