# Candidate accounts & portal

Give candidates their own sign-in (email+password, magic link, and Google) and a personal portal where they can track applications, keep multiple CVs/cover letters, and pick which documents to send per application.

## 1. Candidate sign-in — `/candidate/auth`

New public route, styled like the existing auth page but candidate-branded:
- **Email + password** (sign up / sign in toggle), same pattern as `/auth`.
- **Magic link**: "Email me a sign-in link" using `supabase.auth.signInWithOtp` with `emailRedirectTo = origin + "/candidate/applications"`.
- **Google** via the existing `lovable.auth.signInWithOAuth("google")` broker.
- Already-signed-in visitors are redirected to `/candidate/applications`.
- Home page "I'm a Candidate" card and the `/apply` pages get a "Candidate sign in" link pointing here.

Candidate routes live **outside** `_authenticated/` (that layout forces recruiter onboarding). A lightweight client-side session check redirects to `/candidate/auth` when there's no session. A user can be both a recruiter and a candidate with the same account — the two areas are just different routes.

## 2. Database changes

- New table `public.candidate_documents`: `user_id`, `kind` (`cv` | `cover_letter`), `label` (e.g. "CV — Product roles"), `path` (storage path). RLS: users manage only their own rows.
- `candidates.applicant_user_id uuid` (nullable) — links an application to the signed-in candidate.
- RLS addition on `candidates`: a signed-in user can **read** candidate rows where `applicant_user_id = auth.uid()` (own applications only; recruiter policies unchanged). No candidate write access — updates go through server functions.
- Storage policies on `candidate-files`: users can upload/read under their own prefix `applicants/{user_id}/…`; existing org-member access unchanged.
- Backfill: none needed (older anonymous applications are claimed by email, see below).

## 3. Claiming past applications

New server function `claimMyApplications`: on first visit to the portal, matches rows in `candidates` where `email` equals the user's confirmed auth email and `applicant_user_id IS NULL`, and stamps them with the user's id. Runs once per sign-in, idempotent, so applications submitted anonymously before this feature still show up.

## 4. Candidate portal — `/candidate/applications`

- List of the candidate's applications: position title, company, applied date, current **status** (stage shown in friendly wording, e.g. "Applied", "Interview", "Offer", "Rejected"), and links to the documents sent.
- "My documents" section: upload multiple CVs and cover letters (PDF/DOC/DOCX, 10 MB), each with a custom label; rename, download, or delete them.
- Data via new server functions (`myApplications`, `myDocuments`, `uploadCandidateDocument`, `deleteCandidateDocument`) using the authenticated user's session — never the recruiter client.

## 5. Applying while signed in

`apply.position.$id` and `apply.$orgId` forms detect a signed-in candidate:
- Name/email prefilled from their profile.
- CV/cover letter pickers offer **saved documents** (dropdown of their uploaded files) **or** a fresh upload; a fresh upload can optionally be saved to their documents with a label.
- Submission sets `applicant_user_id` so the application appears in their portal.
- Anonymous applying keeps working exactly as today for signed-out visitors.

## Technical notes

- New files: `src/routes/candidate.auth.tsx`, `src/routes/candidate.applications.tsx`, `src/lib/candidate-portal.functions.ts`; edits to `apply.$orgId.tsx`, `apply.position.$id.tsx`, `submitApplication`, `src/lib/candidate-files.ts`, `index.tsx`, `MarketingShell.tsx` (sign-in affordance).
- One migration covering: `candidate_documents` table + GRANTs + RLS, `candidates.applicant_user_id` + owner-read policy, storage.object policies for the `applicants/` prefix.
- `submitApplication` gains optional saved-document ids instead of inline file data; server verifies the documents belong to the caller before copying their paths onto the application.
- Head metadata for both new routes; portal pages marked noindex.

## Verification

Playwright: sign up as a candidate via email, claim/pre-fill flow, upload two CVs, apply to a position picking a saved CV, confirm the application appears in the portal with status, then sign in as the recruiter and confirm the application is in the pipeline with the chosen document attached.
