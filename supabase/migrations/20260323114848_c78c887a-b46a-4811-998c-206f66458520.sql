
DROP POLICY IF EXISTS "profiles_admin_only_update" ON public.profiles;

CREATE POLICY "profiles_admin_only_update"
ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = ANY (ARRAY['Super-Admin'::user_role, 'Admin'::user_role])
      AND p.status = 'Active'::user_status
  )
)
WITH CHECK (
  -- Only Super-Admins can set role to Super-Admin
  role != 'Super-Admin'::user_role
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'Super-Admin'::user_role
      AND p.status = 'Active'::user_status
  )
);
