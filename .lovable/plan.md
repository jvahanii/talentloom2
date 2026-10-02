# Multi-choice survey ownership

Replace the single "Who owns it" dropdown with a set of tickable options, so a survey can be shared with several groups at once.

## What the creator sees

"Who owns it" becomes a checklist:

- **Just me** — always on. You are always an owner.
- **All my organisations** — every organisation you belong to now gets access.
- **Selected organisations** — choose one or more organisations from a list. Hidden when "All my organisations" is ticked.
- **Invited users** — type email addresses (one per line or comma separated). Those people become co-owners and can see and edit the survey once they sign in with that email.

Any combination works, for example "Organisation A + Organisation B + anna@firm.com".

The same checklist replaces the dropdown on the survey's Settings tab, so you can change sharing later. The survey cards and header show a short label such as "Just me", "2 organisations", or "1 organisation + 3 people".

Note: "Invited users" here means co-owners who manage the survey. It is not the same as respondents on the People tab.

## Technical details

- New tables in the external database (with GRANTs and RLS):
  - `pulse_survey_orgs` (survey_id, org_id), unique per pair
  - `pulse_survey_owners` (survey_id, email, profile_id nullable), unique per pair
- Fill `pulse_survey_orgs` from the current `org_id` where `visibility = 'org'`. Keep the old columns for now but stop reading them.
- `all_orgs boolean` on `pulse_surveys`. When it is true, access goes to orgs the creator belongs to at check time, so organisations they join later are included too.
- Rewrite `can_access_pulse_survey()`: access if you created it, OR you are a member of a linked org, OR (all_orgs is on and you share an org with the creator), OR your profile email matches a row in `pulse_survey_owners`.
- `createPulseSurvey` / `updatePulseSurvey` in `pulse.functions.ts` accept `{ allOrgs, orgIds[], ownerEmails[] }`. They check that every org id is one of the caller's orgs, validate emails with Zod, and replace the link rows. `listPulseSurveys` / `getPulseSurvey` return the sharing summary.
- UI: a shared `OwnershipPicker` component (checkboxes plus org multi-select plus email textarea) used in `surveys.index.tsx` CreateDialog and the `surveys.$id.tsx` Settings tab.
