# Multi-tenant TalentLoom

Today every record belongs to a single person (`user_id` + "only you can see your rows" rules). Multi-tenant means records belong to a **company workspace**, and several people can join that workspace with different permission levels.

## What changes for users

- On first sign-in (during onboarding) a user creates an **organization** — or joins one via an invite link.
- All requisitions, candidates, and stage history belong to the organization, so teammates see the same pipeline.
- **Roles**: owner (billing/delete org), admin (invite, manage everything), member (create/edit candidates & reqs), viewer (read-only).
- **Invites**: admins invite by email; the invitee accepts from a link and lands in the workspace.
- A small **org switcher** in the top bar for people in more than one workspace, plus an org section in Settings (rename, members list, role changes, remove member).
- Existing data is automatically moved into a personal organization for each current user — nothing is lost.

## Data model

- `organizations` — name, slug, created_by.
- `organization_members` — org_id, user_id, role enum (`owner|admin|member|viewer`), unique per pair. Roles live in this table only, never on profiles.
- `organization_invites` — org_id, email, role, token, expires_at, accepted_at.
- Add `org_id` (not null after backfill) to `requisitions`, `candidates`, `stage_history`, `ai_usage`; keep `user_id` as "created by".

## Access rules

- Security-definer helpers `is_org_member(org, uid)` and `has_org_role(org, uid, role)` to avoid recursive policy checks.
- Replace every `auth.uid() = user_id` policy with org-membership checks: read for any member; insert/update for member and above; delete for admin/owner.
- GRANTs for `authenticated` and `service_role` on all new tables.
- Invite acceptance goes through a security-definer function that matches the token to the signed-in user's email.

## App changes

- `src/lib/auth.tsx` gains current-org context (persisted choice, fallback to first membership).
- Every insert path (`NewCandidateDialog`, `requisitions`, `import`, `onboarding`, `RequisitionPanel`) writes `org_id` instead of relying on `user_id` alone.
- Workspace agent + analytics queries scope by org.
- New routes: `/_authenticated/settings` org tab (members, invites, roles) and a public `/invite/$token` acceptance route.
- Role-aware UI: viewers see read-only surfaces; invite/member management restricted to admin/owner.

## Rollout order

1. Migration: tables, helpers, `org_id` columns, backfill personal orgs, swap RLS policies.
2. Auth/org context + org switcher.
3. Scope all reads/writes to the current org.
4. Members, invites, and acceptance flow.
5. Role-based gating pass over the UI.
