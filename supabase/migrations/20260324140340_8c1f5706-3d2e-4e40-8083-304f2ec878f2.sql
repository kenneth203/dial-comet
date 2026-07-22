
-- Tighten UPDATE USING clause to only allow users to update their own profile or Super-Admins to update any
DROP POLICY IF EXISTS "profiles_admin_only_update" ON public.profiles;
CREATE POLICY "profiles_admin_only_update"
ON public.profiles
FOR UPDATE
TO public
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.role = 'Super-Admin'::user_role
    AND p.status = 'Active'::user_status
  )
)
WITH CHECK (
  role NOT IN ('Super-Admin', 'Admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.role = 'Super-Admin'::user_role
    AND p.status = 'Active'::user_status
  )
);
