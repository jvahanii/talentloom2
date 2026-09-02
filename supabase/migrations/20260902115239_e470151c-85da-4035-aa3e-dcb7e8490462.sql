REVOKE ALL ON FUNCTION public.seed_org_titles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_org_permission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_permission(uuid, uuid, text) TO authenticated, service_role;