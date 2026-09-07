# Clerk production is live — verify sign-in and clean up

## Current state

- All DNS records verified (Application 2/2, Email 3/3) and the SSL certificate for `clerk.talentloom.org` is now issued — the Clerk script loads correctly again, so the sign-in form can render.

## Steps

1. Test sign-in in the preview: open Candidate sign in, confirm the Clerk form (with the Google button) renders, and sign in end-to-end. Verify the signed-in chip appears and pages load without errors.
2. If Google sign-in specifically fails, confirm in Google Cloud that the authorized redirect URI is exactly `https://clerk.talentloom.org/v1/oauth_callback` and the preview URL `https://id-preview--b322224f-3d04-40ed-92dd-a27f971ad0bc.lovable.app` is added where needed.
3. Remove the "Sign ins are under construction" banner from the landing page once sign-in works.
4. Publish so talentloom.org picks up the production Clerk instance.

## Notes

- No other code changes expected; everyone signs up fresh on the production instance and profiles relink by email.