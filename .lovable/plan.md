# Status: DNS is now correct — waiting on Clerk's certificate

## What I just verified

- Your DNS records are all in place and resolving, including `clk._domainkey` → dkim1 (the one showing orange in Clerk). That orange mark is stale — click **Run verification again** in Clerk and it should turn green.
- The remaining problem is unchanged: `clerk.talentloom.org` still has **no security certificate**, so the browser refuses the connection and the sign-in form cannot load. I tested it again just now — the certificate has not been issued yet.

## Why nothing works yet

Clerk only issues the certificate after it finishes verifying the domain. The email/DKIM record showing orange may have delayed the overall verification. Now that all DNS records resolve, Clerk should be able to complete it.

## Steps

1. In Clerk (production instance) → **Configure → Domains**: click **Run verification again** to refresh the stale DKIM result and re-trigger certificate issuance.
2. Wait for the domain status to show **Active** (certificate issued). Usually minutes to an hour after verification passes.
3. Once Active, I'll reload the preview and test the sign-in form and Google button end-to-end.
4. After sign-in works, publish so talentloom.org picks it up.

## Notes

- No app code changes are needed — the landing page "under construction" banner can stay until sign-in is confirmed working; I'll remove it then.
- The Google OAuth redirect URI check (`https://clerk.talentloom.org/v1/oauth_callback` in Google Cloud) still applies once the form appears.
