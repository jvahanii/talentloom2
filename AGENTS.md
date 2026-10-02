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
- Pulse survey deletion: a survey linked to organisations (pulse_survey_orgs) cannot be deleted by a creator who has left all of them; only a member with can_manage_titles in a linked org may delete it (checked in deletePulseSurvey via supabaseAdmin).
- Schema changes for app data go to the external Supabase database (EXT_SUPABASE_*) via psql, not the managed Cloud instance.
