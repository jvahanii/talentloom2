# Talentloom Pulse: Surveys and Interviews

Signed-in Talentloom users can create, edit, run and follow surveys and structured interviews, and compare each round with the previous one.

## What users get

- **Pulse dashboard** (new "Pulse" item in the side menu): list of my surveys and interviews, with status (draft / open / closed), number of rounds and latest response count.
- **Builder**: title, description, type (survey or interview), questions in order. Question types: rating 1-5, multiple choice (single or multi), free text, yes/no. Add, reorder, edit, delete.
- **Ownership chosen at creation**: "Just me" (private) or "My organisation" (all members can see and edit, following the existing permission tickboxes).
- **Rounds (waves)**: start a new round from the same questions. Each round has open/close dates (YYYY-MM-DD).
- **Respondents, per survey**:
  - Public link: anyone can answer without signing in.
  - Email invites: each person gets a personal link, so their answers can be followed across rounds. Shows who has answered.
  - Or both.
- **Interviews**: the interviewer opens the interview, picks or adds the person, and fills in the answers during the conversation. Each session belongs to a round.
- **Results**: per question summaries (averages, distributions, yes/no split, text answers), and the key feature: **round-over-round comparison** — change vs. the previous round per question, plus per-person changes for invited respondents and interviewees.
- **Respondent page**: a public, kawaii-styled answer form at a short link; thank-you screen after submitting.

## Database (new tables)

- `pulse_surveys` — owner, optional org, visibility (private/org), kind (survey/interview), title, description, response mode (link/invite/both), status.
- `pulse_questions` — survey, order, type, prompt, options, required.
- `pulse_rounds` — survey, number, opens/closes dates, public token.
- `pulse_respondents` — survey, email, name, personal token (stable across rounds).
- `pulse_responses` — round, respondent (optional), interviewer (for interviews), submitted at.
- `pulse_answers` — response, question, value.

Access rules: private surveys only the creator; org surveys any organisation member. Public answering goes through a server check of the round token (round must be open), never direct table access.

## Technical details

- Routes: `/_authenticated/pulse` (list), `/_authenticated/pulse/$id` (builder + rounds + respondents tabs), `/_authenticated/pulse/$id/results`, `/_authenticated/pulse/$id/interview/$roundId`, public `/p/$token` (answer form).
- Server functions in `src/lib/pulse.functions.ts` using `requireSupabaseAuth` (Clerk-backed, RLS as user); public submit/load functions validate tokens with Zod and use the admin client only after token verification.
- RLS via `current_profile_id()` and `is_org_member`; GRANTs on every new table.
- Invite emails: generate personal links that the user can copy/send in the first version; automated sending can be added later with an email domain.
- Comparison computed server-side: per question mean/distribution per round, delta vs previous round; per-respondent deltas matched by respondent id.
- Charts with the existing chart components; kawaii Mint Soda Pop styling; Pulse landing page "Get started" links to sign-in then the dashboard.
