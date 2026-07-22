
-- call_logs: restrict SELECT to admin-or-higher
DROP POLICY IF EXISTS call_logs_select_authenticated ON public.call_logs;
DROP POLICY IF EXISTS call_logs_select_admin ON public.call_logs;
CREATE POLICY call_logs_select_admin
ON public.call_logs
FOR SELECT
TO authenticated
USING (public.is_admin_or_higher());

-- banner_rotation_settings: restrict SELECT to authenticated only
DROP POLICY IF EXISTS banner_rotation_settings_select_all ON public.banner_rotation_settings;
CREATE POLICY banner_rotation_settings_select_authenticated
ON public.banner_rotation_settings
FOR SELECT
TO authenticated
USING (true);
REVOKE SELECT ON public.banner_rotation_settings FROM anon;
