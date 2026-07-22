-- Fix privilege escalation: restrict profiles INSERT to authenticated users only,
-- and only allow 'Operator' role unless caller is Super-Admin
DROP POLICY IF EXISTS "profiles_admin_only_insert" ON public.profiles;

CREATE POLICY "profiles_authenticated_insert_operator_only"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      role = 'Operator'::user_role
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
          AND p.role = 'Super-Admin'::user_role
          AND p.status = 'Active'::user_status
      )
    )
  );