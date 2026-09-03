# Move TalentLoom's database to your own Supabase project

Goal: your external Supabase project becomes the live backend (schema, data, files, users). The current Lovable Cloud database stays untouched as a backup.

## What you'll need to provide

- Project URL and project ref
- Publishable (anon) key
- Service role key
- Database password / direct connection string

These get stored as secrets, not committed in code.

## Step 1 — Rebuild the schema

Recreate everything in your project, in order:

1. Enum types: `candidate_stage`, `org_role`, `requisition_status`
2. Tables: `organizations`, `organization_titles`, `organization_members`, `organization_invites`, `profiles`, `requisitions`, `candidates`, `stage_history`, `ai_usage`, `candidate_documents`
3. GRANTs for `authenticated` and `service_role` on every table
4. Row-level security policies (identical to today's permission-based rules)
5. Functions: `accept_invite`, `create_organization`, `seed_org_titles`, `seed_sample_data`, `clear_sample_data`, `bump_ai_usage`, `has_org_permission`, `has_org_role`, `is_org_member`, `is_org_owner`, `shares_org_with`, `handle_new_user`, and the trigger functions
6. Triggers: stage history, updated-at, owner/admin guards, title guards
7. Storage: private `candidate-files` bucket plus its policies (org prefix + `applicants/{uid}` prefix)

This is generated as one SQL script you run against your project.

## Step 2 — Migrate user accounts

Passwords cannot be exported from Supabase Auth. Plan:

- Export the existing users (id, email, metadata, created_at) from the Cloud project.
- Recreate each one in your project **with the same user id** via the Admin API, email confirmed, no password.
- Everyone signs in again with a magic link, password reset, or Google. Google users are unaffected as long as the Google provider is configured in your project.

Keeping the same ids means all `user_id` / `created_by` / `applicant_user_id` references stay valid.

## Step 3 — Copy the data

Copy rows table by table, parents first:

```text
organizations -> organization_titles -> organization_members -> organization_invites
profiles -> requisitions -> candidates -> stage_history -> ai_usage -> candidate_documents
```

Triggers that would fire on insert (stage history, admin guards) are disabled during the copy so history rows come across exactly as they are, then re-enabled.

## Step 4 — Copy the stored files

Download every object in `candidate-files` from the Cloud bucket and upload to the same paths in your project's bucket, so `cv_path` / `cover_letter_path` values keep working.

## Step 5 — Point the app at your project

- Store your project's URL, publishable key and service role key as secrets.
- Introduce a small config layer so the browser client, the server publishable client and the admin client read your project's values instead of the Cloud-generated ones. The Lovable-generated files stay in place (they're regenerated automatically) — the override sits alongside them.
- Regenerate the TypeScript database types from your project.
- Configure auth in your project: site URL, redirect URLs (preview + `talentloom2.lovable.app`), email templates, and the Google provider.

## Step 6 — Verify

- Recruiter sign-in, org switcher, pipeline, positions, candidates, import/export
- Candidate sign-in, saved documents, applying to an open position
- Invite link acceptance
- Opening a CV from a candidate record (storage + signed URLs)

## Notes and caveats

- Google OAuth today goes through the Lovable broker. On an external project that path no longer applies — Google sign-in will use your project's own Google provider, which needs client id/secret configured in your Supabase dashboard.
- AI features use the Lovable AI gateway and are unaffected by the database move.
- The Cloud database is left as-is; if anything goes wrong we can flip the config back in one change.
- Any rows written in Cloud after the copy will not appear in the new project, so it's best to do the cutover in one sitting.

## Order of work

1. Collect and store credentials
2. Schema script + run it
3. Users
4. Data
5. Storage files
6. App config switch + types
7. Auth settings and end-to-end verification
