-- Replace profiles_admin_only_update with allowlist approach
-- Non-Super-Admins can only update their own row and must keep role='Operator' and cannot change status
DROP POLICY IF EXISTS "profiles_admin_only_update" ON public.profiles;

CREATE POLICY "profiles_admin_only_update" ON public.profiles
  FOR UPDATE TO authenticated
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
    -- Super-Admins can set any values
    (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = 'Super-Admin'::user_role
        AND p.status = 'Active'::user_status
    ))
    OR
    -- Non-Super-Admins: can only update own row, role must be Operator, status must stay unchanged
    (
      user_id = auth.uid()
      AND role = 'Operator'::user_role
      AND status = (SELECT p2.status FROM profiles p2 WHERE p2.user_id = auth.uid())
    )
  );