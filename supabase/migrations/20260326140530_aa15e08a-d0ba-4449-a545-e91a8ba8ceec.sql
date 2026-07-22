-- Fix privilege escalation: prevent any user from self-assigning elevated roles.
-- Only Super-Admins can set any role; regular users can only update non-role fields on their own profile.

DROP POLICY IF EXISTS "profiles_admin_only_update" ON public.profiles;

CREATE POLICY "profiles_admin_only_update" ON public.profiles
FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid())
  OR
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'Super-Admin'::user_role
      AND p.status = 'Active'::user_status
  ))
)
WITH CHECK (
  -- Block ALL role changes unless caller is Super-Admin
  (
    role NOT IN ('Super-Admin'::user_role, 'Admin'::user_role, 'HR'::user_role, 'Supervisor'::user_role)
  )
  OR
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.role = 'Super-Admin'::user_role
      AND p.status = 'Active'::user_status
  ))
);