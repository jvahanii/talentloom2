<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Personal survey answer history is retrieved only after validating a respondent's personal token and the survey's visibility setting; this keeps anonymous and other respondents' answers private.
- No access rights inside an organisation: every member can see and edit everything in it. Everyone, creators included, is an Admin: org_role has only "admin" and Admin is the only title. Superusers (app_superusers) are separate. has_org_permission() now just means is_org_member(); the titles' can_* columns are all true and unused by the app.
- Pulse survey deletion: a survey linked to organisations (pulse_survey_orgs) cannot be deleted by a creator who has left all of them; only a member of a linked org may delete it (checked in deletePulseSurvey via supabaseAdmin).
- Schema changes for app data go to the external Supabase database (EXT_SUPABASE_*) via psql, not the managed Cloud instance.
- Superuser organisation assignment is additive and server-authorized via is_superuser; conflict-ignoring inserts preserve existing membership titles and use each destination's system Admin title.
