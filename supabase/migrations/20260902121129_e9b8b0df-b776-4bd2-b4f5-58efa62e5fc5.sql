-- Owner title is always fully privileged and immutable
CREATE OR REPLACE FUNCTION public.tg_protect_owner_title()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
begin
  if OLD.name = 'Owner' then
    raise exception 'The Owner title always has full access and cannot be changed';
  end if;
  return NEW;
end; $$;

DROP TRIGGER IF EXISTS trg_protect_owner_title ON public.organization_titles;
CREATE TRIGGER trg_protect_owner_title BEFORE UPDATE ON public.organization_titles
FOR EACH ROW EXECUTE FUNCTION public.tg_protect_owner_title();

-- New titles default to all permissions on
ALTER TABLE public.organization_titles
  ALTER COLUMN can_edit_candidates SET DEFAULT true,
  ALTER COLUMN can_delete_candidates SET DEFAULT true,
  ALTER COLUMN can_edit_positions SET DEFAULT true,
  ALTER COLUMN can_delete_positions SET DEFAULT true,
  ALTER COLUMN can_invite_users SET DEFAULT true,
  ALTER COLUMN can_change_titles SET DEFAULT true,
  ALTER COLUMN can_remove_users SET DEFAULT true,
  ALTER COLUMN can_export SET DEFAULT true,
  ALTER COLUMN can_import SET DEFAULT true,
  ALTER COLUMN can_use_ai SET DEFAULT true,
  ALTER COLUMN can_rename_org SET DEFAULT true,
  ALTER COLUMN can_manage_titles SET DEFAULT true;

-- Only owners may create or delete admins
CREATE OR REPLACE FUNCTION public.is_org_owner(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (
    select 1 from public.organization_members m
    left join public.organization_titles t on t.id = m.title_id
    where m.org_id = _org and m.user_id = _user
      and (m.role = 'owner' or t.name = 'Owner')
  )
$$;
REVOKE ALL ON FUNCTION public.is_org_owner(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_guard_admin_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
declare
  org uuid := coalesce(NEW.org_id, OLD.org_id);
  old_name text;
  new_name text;
begin
  select name into old_name from public.organization_titles where id = OLD.title_id;
  if TG_OP = 'UPDATE' then
    select name into new_name from public.organization_titles where id = NEW.title_id;
  end if;
  if (old_name in ('Owner','Admin') or new_name in ('Owner','Admin'))
     and not public.is_org_owner(org, auth.uid())
     and not (TG_OP = 'DELETE' and OLD.user_id = auth.uid()) then
    raise exception 'Only an owner can add or remove admins';
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end; $$;

DROP TRIGGER IF EXISTS trg_guard_admin_changes_upd ON public.organization_members;
CREATE TRIGGER trg_guard_admin_changes_upd BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_admin_changes();

DROP TRIGGER IF EXISTS trg_guard_admin_changes_del ON public.organization_members;
CREATE TRIGGER trg_guard_admin_changes_del BEFORE DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.tg_guard_admin_changes();