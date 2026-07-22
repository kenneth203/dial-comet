
-- 1. app_permission_grants: restrict SELECT to admins
DROP POLICY IF EXISTS app_grant_select_auth ON public.app_permission_grants;
CREATE POLICY app_grant_select_admin ON public.app_permission_grants
  FOR SELECT TO authenticated USING (public.is_admin_or_higher());

-- 2. app_permissions: restrict SELECT to admins
DROP POLICY IF EXISTS app_perm_select_auth ON public.app_permissions;
CREATE POLICY app_perm_select_admin ON public.app_permissions
  FOR SELECT TO authenticated USING (public.is_admin_or_higher());

-- 3. chat_rooms: add UPDATE/DELETE policies for creator or admin
CREATE POLICY chat_rooms_update_creator_admin ON public.chat_rooms
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin_or_higher())
  WITH CHECK (auth.uid() = created_by OR public.is_admin_or_higher());

CREATE POLICY chat_rooms_delete_creator_admin ON public.chat_rooms
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin_or_higher());

-- 4 & 5. Remove PII tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.comprehensive_users;
ALTER PUBLICATION supabase_realtime DROP TABLE public.system_users;
