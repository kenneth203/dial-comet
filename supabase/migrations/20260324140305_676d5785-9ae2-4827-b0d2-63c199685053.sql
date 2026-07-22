
-- Drop and recreate INSERT policy to block Admin+ role assignment unless Super-Admin
DROP POLICY IF EXISTS "profiles_admin_only_insert" ON public.profiles;
CREATE POLICY "profiles_admin_only_insert"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  role NOT IN ('Super-Admin', 'Admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.role = 'Super-Admin'::user_role
    AND p.status = 'Active'::user_status
  )
);

-- Drop and recreate UPDATE policy to block Admin+ role assignment unless Super-Admin
DROP POLICY IF EXISTS "profiles_admin_only_update" ON public.profiles;
CREATE POLICY "profiles_admin_only_update"
ON public.profiles
FOR UPDATE
TO public
USING (true)
WITH CHECK (
  role NOT IN ('Super-Admin', 'Admin')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.role = 'Super-Admin'::user_role
    AND p.status = 'Active'::user_status
  )
);
