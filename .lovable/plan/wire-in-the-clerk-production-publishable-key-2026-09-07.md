# Wire in the Clerk production publishable key

You provided the production publishable key, and the production secret key is already stored securely. One small edit finishes the switch.

## Change

- `src/lib/clerk.ts` — replace the hardcoded test publishable key fallback (`pk_test_cG9zaXRpdmUtZHVjay03OTUy...`) with the production key `pk_live_Y2xlcmsudGFsZW50bG9vbS5vcmck`.

## Notes

- The `clerk.talentloom.org` domain encoded in this key confirms it's your production instance with a custom domain — nice.
- Make sure the `supabase` JWT template (HS256 + database JWT secret) exists in the production instance before signing in, otherwise the backend will reject tokens.
- Everyone signs up fresh on the production instance; profiles link by email on first sign-in.
- After this, republish so talentloom.org picks up the change.
