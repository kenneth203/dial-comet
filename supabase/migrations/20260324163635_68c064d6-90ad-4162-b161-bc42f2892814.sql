-- Replace overly permissive SELECT policy on todos with scoped access
DROP POLICY IF EXISTS "All authenticated users can view todos" ON todos;

CREATE POLICY "Todos visible to owner assignee or admin"
  ON todos FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (auth.uid())::text = assignee_id
    OR is_admin_or_higher()
  );