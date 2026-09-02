revoke execute on function public.tg_candidate_stage_history() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.is_org_member(uuid, uuid) from anon;
revoke execute on function public.has_org_role(uuid, uuid, public.org_role) from anon;
revoke execute on function public.create_organization(text) from anon;
revoke execute on function public.accept_invite(uuid) from anon;
revoke execute on function public.bump_ai_usage(integer) from anon;