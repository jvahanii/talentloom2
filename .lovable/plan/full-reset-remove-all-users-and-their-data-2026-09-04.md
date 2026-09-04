# Full reset: remove all users and their data

Wipe every account and all app content, keeping only the owner account `talentloom.org@gmail.com`.

## What gets deleted

- All sign-in accounts except `talentloom.org@gmail.com`
- All profiles except that owner's
- All organisations, memberships, invites and titles
- All positions, candidates, applications, stage history and AI usage
- All candidate board preferences and position ratings
- All uploaded files (CVs, cover letters) in the private file bucket

## What is kept

- The `talentloom.org@gmail.com` sign-in account and its profile row
- Database structure, access rules and functions (nothing schema-level changes)
- After the reset, that account signs in and goes through onboarding again to create a fresh organisation

## Order of operations

1. Delete stored files in the candidate file bucket.
2. Delete app rows in dependency order (ratings/prefs/documents/history → candidates → positions → invites/memberships/titles → organisations → profiles).
3. Delete every sign-in account except the kept owner.
4. Verify: report remaining account count, profile count and row counts.

## Technical notes

- Data lives in the external backend project (`dfnotwbswxtrpricbjek`), not Lovable Cloud, so the built-in SQL tools do not reach it. Deletion runs through a one-off script using `EXT_SUPABASE_DB_URL` / `EXT_SUPABASE_SERVICE_ROLE_KEY`.
- Sign-in accounts live in Clerk; they are removed via the Clerk Backend API using `CLERK_SECRET_KEY`, listing users page by page and skipping the kept email.
- Storage objects in `candidate-files` are removed with the service-role storage API (list + remove), before the row deletes.
- Some tables guard against removing the last manager of an organisation; organisations are deleted whole, so those guards are satisfied by deleting memberships together with their organisation in one transaction.
- No application code changes.

This is irreversible.
