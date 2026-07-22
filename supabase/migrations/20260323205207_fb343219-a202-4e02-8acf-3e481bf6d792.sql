-- Fix: Prevent Admins from inserting profiles with Super-Admin role
DROP POLICY IF EXISTS "profiles_admin_only_insert" ON profiles;
CREATE POLICY "profiles_admin_only_insert" ON profiles
  FOR INSERT
  WITH CHECK (
    -- Caller must be an active Admin or Super-Admin
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = ANY (ARRAY['Super-Admin'::user_role, 'Admin'::user_role])
        AND p.status = 'Active'::user_status
    )
    AND (
      -- Only Super-Admins can insert rows with the Super-Admin role
      role <> 'Super-Admin'::user_role
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
          AND p.role = 'Super-Admin'::user_role
          AND p.status = 'Active'::user_status
      )
    )
  );