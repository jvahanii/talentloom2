# Candidate onboarding with CV & cover letter uploads

Add a public application page candidates can fill in themselves, plus recruiter-side file upload on the candidate detail page. Files are stored privately and opened through time-limited links.

## 1. Public apply page

New route `/apply/$orgId` (and optional `?req=<requisition id>` to pre-select a role).

Fields — same as the recruiter "Add candidate" form:

- Full name (required), email, phone
- Requisition (dropdown of that organisation's open roles)
- Source (Referral, LinkedIn, Job board, Agency, Website, Other)
- Notes / "Anything else we should know"
- CV upload (required) and cover letter upload (optional): PDF, DOC, DOCX; max 10 MB each

Stage is always set to "Applied" — candidates can't pick their own stage.

On submit the application is created in the organisation's pipeline and the page shows a confirmation screen. Recruiters get a shareable link from the Requisitions page ("Copy apply link").

## 2. Recruiter side

- The existing "Add candidate" dialog gains the same CV and cover letter upload fields.
- The candidate detail page shows CV and cover letter with download links, plus the ability to upload or replace them.

## 3. Attachments

Each candidate can have a CV and a cover letter. Files live in a private storage bucket; only members of the owning organisation can view them, through short-lived links generated on demand.

## Technical notes

- **Storage**: private bucket `candidate-files`, 10 MB limit. Paths keyed `{org_id}/{candidate_id}/{cv|cover_letter}-{timestamp}.{ext}`. Policies on `storage.objects`: org members can read/write within their org prefix; anonymous applicants upload via a server function, not directly.
- **DB**: add `cv_path text` and `cover_letter_path text` to `public.candidates`.
- **Public submission** goes through a TanStack server function (`src/lib/apply.functions.ts`) using the service-role client, so no anonymous write policies are opened on `candidates`. It validates input with zod (length limits, email format, MIME/size checks), verifies the org and requisition exist, then inserts the candidate with `stage='applied'`, `source` from the form, and `user_id` set to the org owner.
- **Public read of open roles**: a public server function returns only `{ id, title }` for open requisitions of that org — no anon SELECT policy on `requisitions`.
- **Signed URLs**: server function `getCandidateFileUrl` under `requireSupabaseAuth` checks org membership, then returns a 60-minute signed URL.
- Route `src/routes/apply.$orgId.tsx` is public with its own `head()` metadata; recruiter uploads reuse the same helpers from `src/lib/candidate-files.ts`.
- Rate limiting: basic per-IP throttle on the public submit function to prevent spam.
