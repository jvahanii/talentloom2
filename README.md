# Talently — Recruiting Pipeline Tracker

A single-user (single-workspace-per-account) recruiting pipeline template. Kanban-style board, requisition tracking, candidate detail, analytics, CSV import/export. Built on TanStack Start + Lovable Cloud (Supabase under the hood).

## Design

- Glassmorphism aesthetic: frosted cards, backdrop blur, teal accent
- Palette: teal (primary), near-black text, off-white/teal-tinted gradient background
- Mobile-first responsive layout throughout

## Data model

- `profiles` — one row per auth user, auto-created via `on_auth_user_created` trigger. Stores full name, job title (with `job_title_other` free-text fallback when "Other" is chosen), company name, industry, size, plus `onboarding_step` (1–3) and `onboarding_completed_at` for resumable onboarding
- `requisitions` — open roles: `title`, `department`, `hiring_manager`, `status` (open/on_hold/filled/closed), `target_start_date`, `notes`, `is_sample`
- `candidates` — `name`, `email`, `phone`, `requisition_id`, `source`, `stage` (applied/screen/interview/offer/hired/rejected), `resume_link`, `rating` (1-5), `notes`, `last_activity_at`, `is_sample`
- `stage_history` — append-only log of stage transitions; written by the `tg_candidate_stage_change` trigger on candidate insert/update
- `stage_history` — append-only log of stage transitions; written by the `tg_candidate_stage_change` trigger on candidate insert/update

## Security model — single-workspace per user

There are **no orgs, no admin/member roles**. Every table has a `user_id uuid` column, and every RLS policy scopes to `auth.uid() = user_id`. One user's requisitions and candidates are never visible to another user.

- All `SECURITY DEFINER` and `SECURITY INVOKER` functions pin `search_path = public`
- `handle_new_user` (SECURITY DEFINER, trigger-only) has `EXECUTE` revoked from `anon` and `authenticated`
- `seed_sample_data` and `clear_sample_data` are `SECURITY INVOKER` — they run under the caller's RLS and always resolve the user via `auth.uid()`; never trust a client-supplied user id
- Sample rows are marked `is_sample = true`; the clear function only deletes rows where `is_sample = true` AND `user_id = auth.uid()`
- The `_authenticated` layout route (`ssr: false`) redirects unauthenticated users to `/auth` before rendering any child route

## Google OAuth setup

Managed Google OAuth is enabled by default via Lovable Cloud. To use your own Google credentials:

1. Open Lovable Cloud → Users → Authentication Settings → Sign In Methods → Google
2. Toggle "Use your own credentials"
3. In Google Cloud Console, create OAuth Client ID (Web application) with the redirect URL shown in Lovable Cloud's Google provider section
4. Paste the client ID and secret back into Lovable Cloud

## Routes

**Public**: `/` (landing), `/auth` (sign in / sign up), `/docs`

**Onboarding**: `/onboarding` — 3-step flow shown after signup (personal info → company info → import data or pick sample data). Own auth gate (`ssr: false`), resumable via `profiles.onboarding_step`. The `/_authenticated` gate redirects here whenever `onboarding_completed_at` is null. Sample data no longer seeds automatically — it's an explicit choice on Step 3.

**Authenticated (`/_authenticated/*`)**:
- `/pipeline` — Kanban board (default view). Desktop drag-and-drop + stage dropdown as touch/mobile fallback. Filter by requisition and source.
- `/requisitions` — grid of open roles with per-req candidate counts, create/edit/close
- `/candidates/$id` — full candidate detail with stage history timeline
- `/analytics` — funnel bar chart, source pie, average time-in-stage, KPIs
- `/import` — CSV upload with downloadable template, header auto-mapping, preview table
- `/export` — CSV export of candidates and requisitions
- `/settings` — profile (full name, role, company, industry, size — all editable), "Connect your tools" (marked Coming soon), clear sample data

## Known gaps

- Live LinkedIn/Indeed/ATS connectors are placeholder UI only; import via CSV
- Drag-and-drop uses native HTML5 events on desktop; touch devices use the stage dropdown
- Resume storage is a link field, not file upload
- No email notifications, no team invites (intentional — single-user template)
- Analytics uses whatever `stage_history` currently exists; brand-new accounts show zero time-in-stage until a few transitions happen

## Remix instructions

**Carries over on remix:**
- Full schema (enums, tables, triggers, RLS policies, GRANTs)
- Google OAuth provider config (managed credentials)
- Seed/clear sample-data helpers
- All frontend code, design system, and routes

**Does NOT carry over:**
- Any real candidate or requisition data — remix produces a fresh backend
- Custom Google OAuth credentials if you supplied your own (re-enter in Cloud settings)

## Local development

```bash
bun install
bun run dev
```

The route tree in `src/routeTree.gen.ts` is regenerated automatically by the TanStack Router Vite plugin — do not edit it by hand.
