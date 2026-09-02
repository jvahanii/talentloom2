create or replace function public.shares_org_with(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members a
    join public.organization_members b on a.org_id = b.org_id
    where a.user_id = _a and b.user_id = _b
  )
$$;
revoke execute on function public.shares_org_with(uuid, uuid) from anon;

create policy "co-members can view profiles" on public.profiles
for select to authenticated
using (public.shares_org_with(auth.uid(), id));