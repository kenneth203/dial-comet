REVOKE ALL ON FUNCTION public.is_locked_admin_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_locked_admin_permission(text, text) TO authenticated, service_role;
