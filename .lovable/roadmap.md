# Roadmap

## Open

### Organisation picker on sign-in (new, 2026-11-03)
- [ ] Persist last-used org per user (DB column on external Supabase `profiles`: `last_org_id`)
- [ ] Server functions: read last org, list my orgs, set last org
- [ ] Route: org picker page (kawaii style) shown when signed in, has ≥2 orgs, no remembered org
- [ ] Wire into sign-in flow: auto-enter when 1 org or remembered org; picker when multiple; unchanged when 0 orgs
- [ ] Save choice on org switch too (keep memory fresh)
- [ ] Verify: typecheck/build; signed-in flow untestable in sandbox (Clerk origin restriction)

## Deferred / blocked
- Invitation email domain setup — deferred by user ("lets skip this for now")
- Google OAuth end-to-end verification — needs real sign-in (redirect URI must be exactly https://clerk.talentloom.org/v1/oauth_callback)
- Published talentloom.org "Not Found" after republish — unconfirmed, user to retest after publish
