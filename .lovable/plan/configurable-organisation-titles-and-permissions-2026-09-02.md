# Configurable organisation titles and permissions

Today every user in an organisation has one of four fixed roles (owner, admin, member, viewer), and the permission rules are hard-coded into the app and the database. Job titles such as "Talent Lead" live on a personal profile and mean nothing.

This change makes titles a per-organisation concept with explicit, editable permission checkboxes.

## What changes for users

- Settings → Organisation gains a **Titles & permissions** section (admins/owners only).
- Each organisation starts with four titles seeded to match today's behaviour: Owner, Admin, Member, Viewer. Admins can rename them, add new ones (e.g. "Talent Lead", "Hiring Manager", "HR Ops"), and delete unused ones.
- Every title has a grid of permission checkboxes:
  - **Candidates** — view, create/edit, delete
  - **Positions** — view, create/edit, delete
  - **People & invites** — invite users, change titles, remove users
  - **Data & settings** — export, import, AI copilot, rename organisation, manage titles
- In the users list, each person is assigned a **title** instead of a raw role; invites also pick a title.
- The organisation always keeps at least one person with the "manage titles" and "change titles" permissions, so nobody can lock themselves out.
- Existing members keep exactly the access they have today — their current role becomes the equivalent seeded title.

## Data model

- `organization_titles` — org_id, name, is_system (for the four seeded ones), sort order, and one boolean column per permission listed above.
- `organization_members.title_id` — nullable FK during migration, backfilled from the current `role`, then required. The old `role` column stays for one release as a fallback so nothing breaks mid-deploy.
- `organization_invites.title_id` — same treatment.
- Backfill: for every existing organisation, create the four system titles with permission sets identical to today's rules and point each member/invite at the matching one.

## Access rules

- New security-definer helper `has_org_permission(_org uuid, _user uuid, _perm text)` returns the boolean from the caller's title. It replaces `has_org_role(...)` inside RLS policies.
- Policies rewritten:
  - candidates / requisitions: read → `candidates.view` / `positions.view`; insert+update → the matching create/edit permission; delete → the matching delete permission.
  - `organization_members` update/delete and `organization_invites` all-operations → the people permissions.
  - `organizations` update → `settings.rename`.
  - `organization_titles`: readable by any member, writable only with `settings.manage_titles`.
- Guard triggers prevent deleting a title that is still assigned, and prevent removing the last user who can manage titles.
- GRANTs for `authenticated` and `service_role` on the new table.

## App changes

- `src/lib/org.tsx`: the org context exposes the current title plus a `can(permission)` helper, replacing the `role === "owner" | "admin"` checks.
- Replace every existing role check with `can(...)`:
  - `OrgSettings.tsx` (invite, change title, remove user, rename org)
  - `requisitions.tsx`, `RequisitionPanel.tsx` (create/edit/delete positions)
  - `pipeline.tsx`, `candidates.index.tsx`, `candidates.$id.tsx`, `NewCandidateDialog.tsx` (candidate create/edit/delete, drag-and-drop)
  - `import.tsx`, `export.tsx`, `workspace.tsx` (import, export, copilot)
- New `TitlesPanel` component inside `OrgSettings` for the title list, permission checkbox grid, add/rename/delete.
- The users list and invite form switch from a role dropdown to a title dropdown fed from `organization_titles`.

## Technical notes

- Permissions are stored as individual boolean columns rather than JSON so RLS policies stay index-friendly and readable.
- `has_org_permission` is `stable security definer` with a pinned `search_path`, matching the existing `is_org_member` / `has_org_role` helpers, and avoids recursive policy evaluation.
- The old `org_role` enum and `has_org_role` remain in place until the app no longer references them.

## Rollout order

1. Migration: `organization_titles`, permission helper, title columns on members/invites, backfill, policy swap.
2. Org context `can()` helper.
3. Titles & permissions UI in Settings.
4. Swap member/invite role pickers to titles.
5. Replace remaining hard-coded role checks across the app.
