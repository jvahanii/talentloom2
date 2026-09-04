# Fix remaining Clerk integration: storage policies and file access

The HS256 token verification issue that caused `Could not load your account: Failed to fetch` has been addressed. The remaining known problem is that the `candidate-files` storage policies still reference `auth.uid()` (the old Supabase Auth user ID) instead of `public.current_profile_id()` (the Clerk-linked TalentLoom profile). Until this is fixed, signed-in candidates cannot upload or read their own documents, and recruiters cannot access candidate files attached to their organisations.

## What needs to change

1. Inspect the seven existing policies on `storage.objects` for the `candidate-files` bucket.
2. Rewrite them so the caller is identified by `public.current_profile_id()`:
   - Candidate "My documents" paths (`applicants/<profileId>/...`) compare against `public.current_profile_id()::text`.
   - Organisation-scoped paths (`<orgId>/<candidateId>/...`) use `public.current_profile_id()` for `is_org_member` / `has_org_role` checks.
3. Keep the same permission matrix (candidate owns their documents; org members/admins read/upload/update/delete according to existing rules).

## Verification

- Run `bunx tsgo --noEmit` to confirm the app still builds.
- Test a signed-in candidate uploading a CV/cover letter and seeing it in "My documents".
- Test a recruiter opening a candidate and viewing/downloading attached files.
- Confirm anonymous applications still work (they use the `applicants/<profileId>/...` path after profile provisioning).

## Out of scope

- Changing file path conventions or bucket names.
- New features beyond restoring the existing file access behaviour under Clerk.
