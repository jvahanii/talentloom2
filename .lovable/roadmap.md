# Roadmap

## Done
- Organisation picker on sign-in (2026-11-03): `needsOrgChoice` in `src/lib/org.tsx` (signed in, ≥2 own orgs, nothing remembered in browser or on profile), full-screen `src/components/OrgPicker.tsx` rendered from `AppShell.tsx`; picking saves `last_org_id` so next sign-in goes straight there. 0 orgs → unchanged (create/join screen); 1 org → auto-enter. Build OK; signed-in flow untestable in sandbox (Clerk origin restriction).

## Deferred / blocked
- Invitation email domain setup — deferred by user ("lets skip this for now")
- Google OAuth end-to-end verification — needs real sign-in (redirect URI must be exactly https://clerk.talentloom.org/v1/oauth_callback)
- Published talentloom.org "Not Found" after republish — unconfirmed, user to retest after publish
