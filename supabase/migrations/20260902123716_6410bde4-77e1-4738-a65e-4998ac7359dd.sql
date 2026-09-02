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
    (_org, 'Owner',  true, 10, true, true, true, true, true, true, true, true, true, true, true, true, true, true),
    (_org, 'Admin',  true, 20, true, true, true, true, true, true, true, true, true, true, true, true, true, true),
    (_org, 'Member', true, 30, true, true, true, true, true, true, true, true, true, true, true, true, true, true),
    (_org, 'Viewer', true, 40, true, true, true, true, true, true, true, true, true, true, true, true, true, true)
  ON CONFLICT (org_id, name) DO NOTHING;
$$;