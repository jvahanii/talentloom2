-- 1. Role enum
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');

-- 2. Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

-- 3. Members
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
grant select, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;
alter table public.organization_members enable row level security;

-- 4. Invites
create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null default 'member',
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organization_invites to authenticated;
grant all on public.organization_invites to service_role;
alter table public.organization_invites enable row level security;

-- 5. Helper functions (security definer to avoid recursive RLS)
create or replace function public.is_org_member(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where org_id = _org and user_id = _user)
$$;

create or replace function public.has_org_role(_org uuid, _user uuid, _min public.org_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where org_id = _org and user_id = _user
      and (case role when 'owner' then 4 when 'admin' then 3 when 'member' then 2 else 1 end)
        >= (case _min when 'owner' then 4 when 'admin' then 3 when 'member' then 2 else 1 end)
  )
$$;

-- 6. org_id columns
alter table public.requisitions add column org_id uuid references public.organizations(id) on delete cascade;
alter table public.candidates add column org_id uuid references public.organizations(id) on delete cascade;
alter table public.stage_history add column org_id uuid references public.organizations(id) on delete cascade;
alter table public.ai_usage add column org_id uuid references public.organizations(id) on delete cascade;

-- 7. Backfill: personal org per existing user, move their data in
insert into public.organizations (name, created_by)
select coalesce(nullif(trim(p.full_name), ''), 'My') || ' workspace', p.id
from public.profiles p
where not exists (select 1 from public.organization_members m where m.user_id = p.id);

insert into public.organization_members (org_id, user_id, role)
select o.id, o.created_by, 'owner' from public.organizations o
where not exists (select 1 from public.organization_members m where m.org_id = o.id and m.user_id = o.created_by);

update public.requisitions r set org_id = (select m.org_id from public.organization_members m where m.user_id = r.user_id and m.role = 'owner' limit 1) where r.org_id is null;
update public.candidates c set org_id = (select m.org_id from public.organization_members m where m.user_id = c.user_id and m.role = 'owner' limit 1) where c.org_id is null;
update public.stage_history s set org_id = (select m.org_id from public.organization_members m where m.user_id = s.user_id and m.role = 'owner' limit 1) where s.org_id is null;
update public.ai_usage a set org_id = (select m.org_id from public.organization_members m where m.user_id = a.user_id and m.role = 'owner' limit 1) where a.org_id is null;

alter table public.requisitions alter column org_id set not null;
alter table public.candidates alter column org_id set not null;
alter table public.stage_history alter column org_id set not null;

-- 8. RLS: organizations
create policy "members can view their orgs" on public.organizations for select to authenticated using (public.is_org_member(id, auth.uid()));
create policy "admins can update org" on public.organizations for update to authenticated using (public.has_org_role(id, auth.uid(), 'admin')) with check (public.has_org_role(id, auth.uid(), 'admin'));

-- 9. RLS: members
create policy "members view org membership" on public.organization_members for select to authenticated using (public.is_org_member(org_id, auth.uid()));
create policy "admins update members" on public.organization_members for update to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin')) with check (public.has_org_role(org_id, auth.uid(), 'admin'));
create policy "admins or self remove members" on public.organization_members for delete to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin') or user_id = auth.uid());

-- 10. RLS: invites
create policy "admins view invites" on public.organization_invites for select to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin'));
create policy "admins create invites" on public.organization_invites for insert to authenticated with check (public.has_org_role(org_id, auth.uid(), 'admin'));
create policy "admins update invites" on public.organization_invites for update to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin')) with check (public.has_org_role(org_id, auth.uid(), 'admin'));
create policy "admins delete invites" on public.organization_invites for delete to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin'));

-- 11. Swap data policies to org scope
drop policy "own reqs all" on public.requisitions;
create policy "org members read reqs" on public.requisitions for select to authenticated using (public.is_org_member(org_id, auth.uid()));
create policy "org members add reqs" on public.requisitions for insert to authenticated with check (public.has_org_role(org_id, auth.uid(), 'member') and user_id = auth.uid());
create policy "org members edit reqs" on public.requisitions for update to authenticated using (public.has_org_role(org_id, auth.uid(), 'member')) with check (public.has_org_role(org_id, auth.uid(), 'member'));
create policy "org admins delete reqs" on public.requisitions for delete to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin'));

drop policy "own cands all" on public.candidates;
create policy "org members read cands" on public.candidates for select to authenticated using (public.is_org_member(org_id, auth.uid()));
create policy "org members add cands" on public.candidates for insert to authenticated with check (public.has_org_role(org_id, auth.uid(), 'member') and user_id = auth.uid());
create policy "org members edit cands" on public.candidates for update to authenticated using (public.has_org_role(org_id, auth.uid(), 'member')) with check (public.has_org_role(org_id, auth.uid(), 'member'));
create policy "org admins delete cands" on public.candidates for delete to authenticated using (public.has_org_role(org_id, auth.uid(), 'admin'));

drop policy "own hist select" on public.stage_history;
create policy "org members read history" on public.stage_history for select to authenticated using (public.is_org_member(org_id, auth.uid()));

drop policy "own ai usage select" on public.ai_usage;
create policy "org members read ai usage" on public.ai_usage for select to authenticated using (public.is_org_member(org_id, auth.uid()));

-- 12. create_organization: org + owner membership atomically
create or replace function public.create_organization(_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_org uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.organizations (name, created_by) values (_name, uid) returning id into new_org;
  insert into public.organization_members (org_id, user_id, role) values (new_org, uid, 'owner');
  return new_org;
end; $$;

-- 13. accept_invite: join org via token
create or replace function public.accept_invite(_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv public.organization_invites%rowtype;
  user_email text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select email into user_email from auth.users where id = uid;
  select * into inv from public.organization_invites
    where token = _token and accepted_at is null and expires_at > now()
      and lower(email) = lower(user_email);
  if not found then raise exception 'invite not found, expired, or sent to a different email'; end if;
  insert into public.organization_members (org_id, user_id, role) values (inv.org_id, uid, inv.role)
    on conflict (org_id, user_id) do nothing;
  update public.organization_invites set accepted_at = now() where id = inv.id;
  return inv.org_id;
end; $$;

-- 14. Triggers/functions that write org-scoped rows
create or replace function public.tg_candidate_stage_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.stage_history(user_id, candidate_id, from_stage, to_stage, org_id)
    values (NEW.user_id, NEW.id, null, NEW.stage, NEW.org_id);
  elsif TG_OP = 'UPDATE' and NEW.stage is distinct from OLD.stage then
    insert into public.stage_history(user_id, candidate_id, from_stage, to_stage, org_id)
    values (NEW.user_id, NEW.id, OLD.stage, NEW.stage, NEW.org_id);
  end if;
  return null;
end; $$;

create or replace function public.seed_sample_data()
returns void language plpgsql set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
  r1 uuid; r2 uuid; r3 uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select m.org_id into org from public.organization_members m where m.user_id = uid order by m.created_at limit 1;
  if org is null then raise exception 'no organization'; end if;
  if exists (select 1 from public.requisitions where org_id = org) then return; end if;

  insert into public.requisitions(user_id, org_id, title, department, hiring_manager, status, target_start_date, notes, is_sample)
  values (uid, org, 'Senior Frontend Engineer', 'Engineering', 'Priya Shah', 'open', now()::date + 30, 'React + TypeScript, remote OK', true) returning id into r1;
  insert into public.requisitions(user_id, org_id, title, department, hiring_manager, status, target_start_date, notes, is_sample)
  values (uid, org, 'Product Designer', 'Design', 'Marcus Lee', 'open', now()::date + 45, 'Portfolio required', true) returning id into r2;
  insert into public.requisitions(user_id, org_id, title, department, hiring_manager, status, target_start_date, notes, is_sample)
  values (uid, org, 'Sales Development Rep', 'Sales', 'Elena Ortiz', 'on_hold', now()::date + 60, 'Backfill', true) returning id into r3;

  insert into public.candidates(user_id, org_id, requisition_id, name, email, phone, source, stage, notes, rating, is_sample) values
    (uid, org, r1, 'Ava Thompson', 'ava@example.com', '555-0101', 'LinkedIn', 'applied', 'Strong React portfolio', 4, true),
    (uid, org, r1, 'Ben Carter', 'ben@example.com', '555-0102', 'Referral', 'screen', 'Referred by Priya', 5, true),
    (uid, org, r1, 'Chloe Nguyen', 'chloe@example.com', '555-0103', 'Job board', 'interview', 'Second round scheduled', 4, true),
    (uid, org, r1, 'Diego Ramos', 'diego@example.com', '555-0104', 'Agency', 'offer', 'Offer sent Monday', 5, true),
    (uid, org, r2, 'Emma Wilson', 'emma@example.com', '555-0105', 'LinkedIn', 'screen', 'Nice portfolio', 4, true),
    (uid, org, r2, 'Farid Ahmadi', 'farid@example.com', '555-0106', 'Referral', 'interview', 'Design challenge complete', 4, true),
    (uid, org, r2, 'Grace Kim', 'grace@example.com', '555-0107', 'Job board', 'rejected', 'Not enough SaaS exp', 2, true),
    (uid, org, r3, 'Henry Park', 'henry@example.com', '555-0108', 'LinkedIn', 'applied', 'Junior SDR', 3, true),
    (uid, org, r3, 'Isla Reyes', 'isla@example.com', '555-0109', 'Referral', 'hired', 'Starts next month', 5, true);
end; $$;

create or replace function public.clear_sample_data()
returns void language plpgsql set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.candidates where user_id = uid and is_sample = true;
  delete from public.requisitions where user_id = uid and is_sample = true;
end; $$;

create or replace function public.bump_ai_usage(p_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
  today date := (now() at time zone 'utc')::date;
  new_calls int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_limit is null or p_limit < 0 then raise exception 'invalid limit'; end if;
  select m.org_id into org from public.organization_members m where m.user_id = uid order by m.created_at limit 1;

  insert into public.ai_usage(user_id, day, calls, org_id)
  values (uid, today, 1, org)
  on conflict (user_id, day) do update
    set calls = public.ai_usage.calls + 1
    where public.ai_usage.calls < p_limit
  returning calls into new_calls;

  return new_calls is not null;
end; $$;

create trigger trg_orgs_upd before update on public.organizations for each row execute function public.tg_set_updated_at();