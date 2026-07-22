-- Fix INSERT policy: block both Admin and Super-Admin role assignment unless caller is Super-Admin
DROP POLICY IF EXISTS "profiles_admin_only_insert" ON public.profiles;
CREATE POLICY "profiles_admin_only_insert" ON public.profiles
FOR INSERT
WITH CHECK (
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.role IN ('Super-Admin', 'Admin')
    AND p.status = 'Active'
  ))
  AND
  (
    role NOT IN ('Super-Admin', 'Admin')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role = 'Super-Admin'
      AND p.status = 'Active'
    )
  )
);

-- Fix UPDATE policy: block both Admin and Super-Admin role promotion unless caller is Super-Admin
DROP POLICY IF EXISTS "profiles_admin_only_update" ON public.profiles;
CREATE POLICY "profiles_admin_only_update" ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.role IN ('Super-Admin', 'Admin')
    AND p.status = 'Active'
  )
)
WITH CHECK (
  role NOT IN ('Super-Admin', 'Admin')
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.role = 'Super-Admin'
    AND p.status = 'Active'
  )
);