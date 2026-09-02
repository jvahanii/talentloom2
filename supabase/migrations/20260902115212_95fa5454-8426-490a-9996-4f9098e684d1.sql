-- 1. Titles table
CREATE TABLE public.organization_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  can_view_candidates boolean NOT NULL DEFAULT true,
  can_edit_candidates boolean NOT NULL DEFAULT false,
  can_delete_candidates boolean NOT NULL DEFAULT false,
  can_view_positions boolean NOT NULL DEFAULT true,
  can_edit_positions boolean NOT NULL DEFAULT false,
  can_delete_positions boolean NOT NULL DEFAULT false,
  can_invite_users boolean NOT NULL DEFAULT false,
  can_change_titles boolean NOT NULL DEFAULT false,
  can_remove_users boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  can_import boolean NOT NULL DEFAULT false,
  can_use_ai boolean NOT NULL DEFAULT false,
  can_rename_org boolean NOT NULL DEFAULT false,
  can_manage_titles boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_titles TO authenticated;
GRANT ALL ON public.organization_titles TO service_role;

CREATE TRIGGER trg_org_titles_upd BEFORE UPDATE ON public.organization_titles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Title references
ALTER TABLE public.organization_members ADD COLUMN title_id uuid REFERENCES public.organization_titles(id) ON DELETE RESTRICT;
ALTER TABLE public.organization_invites ADD COLUMN title_id uuid REFERENCES public.organization_titles(id) ON DELETE RESTRICT;

-- 3. Seed system titles for every existing org + backfill
CREATE OR REPLACE FUNCTION public.seed_org_titles(_org uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.organization_titles (
    org_id, name, is_system, sort_order,
    can_view_candidates, can_edit_candidates, can_delete_candidates,
    can_view_positions, can_edit_positions, can_delete_positions,
    can_invite_users, can_change_titles, can_remove_users,
    can_export, can_import, can_use_ai, can_rename_org, can_manage_titles
  )
  VALUES
    (_org, 'Owner',  true, 10, true, true, true,  true, true, true,  true, true, true,  true, true, true, true, true),
    (_org, 'Admin',  true, 20, true, true, true,  true, true, true,  true, true, true,  true, true, true, true, true),
    (_org, 'Member', true, 30, true, true, false, true, true, false, false, false, false, true, true, true, false, false),
    (_org, 'Viewer', true, 40, true, false, false, true, false, false, false, false, false, true, false, true, false, false)
  ON CONFLICT (org_id, name) DO NOTHING;
$$;

DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_org_titles(o.id);
  END LOOP;
END $$;

UPDATE public.organization_members m
SET title_id = t.id
FROM public.organization_titles t
WHERE t.org_id = m.org_id AND t.is_system
  AND lower(t.name) = m.role::text
  AND m.title_id IS NULL;

UPDATE public.organization_invites i
SET title_id = t.id
FROM public.organization_titles t
WHERE t.org_id = i.org_id AND t.is_system
  AND lower(t.name) = i.role::text
  AND i.title_id IS NULL;

-- 4. Permission helper
CREATE OR REPLACE FUNCTION public.has_org_permission(_org uuid, _user uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok boolean;
BEGIN
  EXECUTE format(
    'select coalesce(bool_or(t.%I), false) from public.organization_members m join public.organization_titles t on t.id = m.title_id where m.org_id = $1 and m.user_id = $2',
    'can_' || regexp_replace(_perm, '[^a-z_]', '', 'g')
  ) INTO ok USING _org, _user;
  RETURN coalesce(ok, false);
END;
$$;

-- 5. Keep create_organization seeding titles
CREATE OR REPLACE FUNCTION public.create_organization(_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare uid uuid := auth.uid(); new_org uuid; owner_title uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.organizations (name, created_by) values (_name, uid) returning id into new_org;
  perform public.seed_org_titles(new_org);
  select id into owner_title from public.organization_titles where org_id = new_org and name = 'Owner';
  insert into public.organization_members (org_id, user_id, role, title_id) values (new_org, uid, 'owner', owner_title);
  return new_org;
end; $$;

-- 6. accept_invite carries the title
CREATE OR REPLACE FUNCTION public.accept_invite(_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  uid uuid := auth.uid();
  inv public.organization_invites%rowtype;
  user_email text;
  fallback_title uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select email into user_email from auth.users where id = uid;
  select * into inv from public.organization_invites
    where token = _token and accepted_at is null and expires_at > now()
      and lower(email) = lower(user_email);
  if not found then raise exception 'invite not found, expired, or sent to a different email'; end if;
  if inv.title_id is null then
    select id into fallback_title from public.organization_titles
      where org_id = inv.org_id and lower(name) = inv.role::text limit 1;
  else
    fallback_title := inv.title_id;
  end if;
  insert into public.organization_members (org_id, user_id, role, title_id)
    values (inv.org_id, uid, inv.role, fallback_title)
    on conflict (org_id, user_id) do nothing;
  update public.organization_invites set accepted_at = now() where id = inv.id;
  return inv.org_id;
end; $$;

-- 7. Guard triggers
CREATE OR REPLACE FUNCTION public.tg_title_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if exists (select 1 from public.organization_members where title_id = OLD.id)
     or exists (select 1 from public.organization_invites where title_id = OLD.id and accepted_at is null) then
    raise exception 'This title is still assigned to someone';
  end if;
  return OLD;
end; $$;

CREATE TRIGGER trg_title_delete_guard BEFORE DELETE ON public.organization_titles
FOR EACH ROW EXECUTE FUNCTION public.tg_title_delete_guard();

CREATE OR REPLACE FUNCTION public.tg_keep_one_manager()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
declare org uuid; managers int;
begin
  org := coalesce(NEW.org_id, OLD.org_id);
  select count(*) into managers
  from public.organization_members m
  join public.organization_titles t on t.id = m.title_id
  where m.org_id = org and t.can_manage_titles;
  if managers = 0 then
    raise exception 'The organisation must keep at least one person who can manage titles';
  end if;
  return null;
end; $$;

CREATE CONSTRAINT TRIGGER trg_members_keep_manager
AFTER UPDATE OR DELETE ON public.organization_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.tg_keep_one_manager();

CREATE CONSTRAINT TRIGGER trg_titles_keep_manager
AFTER UPDATE ON public.organization_titles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.tg_keep_one_manager();

-- 8. RLS for titles
ALTER TABLE public.organization_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read titles" ON public.organization_titles
FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "managers insert titles" ON public.organization_titles
FOR INSERT TO authenticated WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'manage_titles'));

CREATE POLICY "managers update titles" ON public.organization_titles
FOR UPDATE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'manage_titles'))
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'manage_titles'));

CREATE POLICY "managers delete titles" ON public.organization_titles
FOR DELETE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'manage_titles') AND NOT is_system);

-- 9. Swap existing policies onto permissions
DROP POLICY IF EXISTS "org admins delete cands" ON public.candidates;
DROP POLICY IF EXISTS "org members add cands" ON public.candidates;
DROP POLICY IF EXISTS "org members edit cands" ON public.candidates;
DROP POLICY IF EXISTS "org members read cands" ON public.candidates;

CREATE POLICY "read cands" ON public.candidates FOR SELECT TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'view_candidates'));
CREATE POLICY "add cands" ON public.candidates FOR INSERT TO authenticated
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'edit_candidates') AND user_id = auth.uid());
CREATE POLICY "edit cands" ON public.candidates FOR UPDATE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'edit_candidates'))
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'edit_candidates'));
CREATE POLICY "delete cands" ON public.candidates FOR DELETE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'delete_candidates'));

DROP POLICY IF EXISTS "org admins delete reqs" ON public.requisitions;
DROP POLICY IF EXISTS "org members add reqs" ON public.requisitions;
DROP POLICY IF EXISTS "org members edit reqs" ON public.requisitions;
DROP POLICY IF EXISTS "org members read reqs" ON public.requisitions;

CREATE POLICY "read reqs" ON public.requisitions FOR SELECT TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'view_positions'));
CREATE POLICY "add reqs" ON public.requisitions FOR INSERT TO authenticated
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'edit_positions') AND user_id = auth.uid());
CREATE POLICY "edit reqs" ON public.requisitions FOR UPDATE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'edit_positions'))
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'edit_positions'));
CREATE POLICY "delete reqs" ON public.requisitions FOR DELETE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'delete_positions'));

DROP POLICY IF EXISTS "admins update members" ON public.organization_members;
DROP POLICY IF EXISTS "admins or self remove members" ON public.organization_members;

CREATE POLICY "change member titles" ON public.organization_members FOR UPDATE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'change_titles'))
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'change_titles'));
CREATE POLICY "remove members" ON public.organization_members FOR DELETE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'remove_users') OR user_id = auth.uid());

DROP POLICY IF EXISTS "admins create invites" ON public.organization_invites;
DROP POLICY IF EXISTS "admins delete invites" ON public.organization_invites;
DROP POLICY IF EXISTS "admins update invites" ON public.organization_invites;
DROP POLICY IF EXISTS "admins view invites" ON public.organization_invites;

CREATE POLICY "view invites" ON public.organization_invites FOR SELECT TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'invite_users'));
CREATE POLICY "create invites" ON public.organization_invites FOR INSERT TO authenticated
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'invite_users'));
CREATE POLICY "update invites" ON public.organization_invites FOR UPDATE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'invite_users'))
WITH CHECK (public.has_org_permission(org_id, auth.uid(), 'invite_users'));
CREATE POLICY "delete invites" ON public.organization_invites FOR DELETE TO authenticated
USING (public.has_org_permission(org_id, auth.uid(), 'invite_users'));

DROP POLICY IF EXISTS "admins can update org" ON public.organizations;
CREATE POLICY "update org" ON public.organizations FOR UPDATE TO authenticated
USING (public.has_org_permission(id, auth.uid(), 'rename_org'))
WITH CHECK (public.has_org_permission(id, auth.uid(), 'rename_org'));