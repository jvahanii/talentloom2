# Fix candidate CV saving

## What's wrong

Candidates can't save a CV to their profile. The file storage rules are the cause, and it's confirmed, not a guess.

Candidate documents are stored under a folder path starting with `applicants/`, while recruiter files are stored under a folder named after the company's ID. The rules that let recruiters read/write company files try to interpret the first folder segment as a company ID — including when that segment is the word `applicants`. That conversion fails with a hard error, and because the rules are all evaluated together, the candidate's own upload is aborted too.

Evidence:

- Converting the folder name `applicants` to a company ID errors: `invalid input syntax for type uuid: "applicants"`.
- The storage bucket contains zero objects under `applicants/` — no candidate-portal upload has ever succeeded, while recruiter-side uploads (which go through the admin path that bypasses these rules) are present.

The candidate documents table, its access rules and grants are all correct, so no app-code change is needed for the core fix.

## The fix

Rewrite the four company-scoped storage rules on the `candidate-files` bucket so they only apply when the first folder segment actually looks like a company ID, and never to the `applicants/` prefix. The candidate rules stay as they are.

Concretely, each company rule gains a guard:

```text
first folder segment <> 'applicants'
AND first folder segment matches a UUID pattern
AND (existing company-membership check)
```

Implemented as a small immutable helper (e.g. `public.storage_org_uuid(name text) returns uuid`) that returns NULL for non-UUID segments, so the membership check simply evaluates to false instead of erroring. The four rules — company read, upload, update, delete — are dropped and recreated using it.

## Verification

1. Sign in as a candidate, upload a CV in the candidate portal, confirm it appears in the saved documents list and the file lands under `applicants/<user id>/`.
2. Re-open it from the portal (download link) to check reads work.
3. Sign in as a recruiter and confirm candidate files on a candidate detail page still open, and recruiter-side CV upload still works.

## Technical notes

- Change applies to the external Supabase project (the live backend), via SQL on `storage.objects` policies; Lovable Cloud is untouched.
- No changes to `src/lib/candidate-portal.functions.ts` are required; if verification surfaces a second failure (e.g. error surfacing), the upload handler's generic error message will be improved to pass the underlying storage error through.
