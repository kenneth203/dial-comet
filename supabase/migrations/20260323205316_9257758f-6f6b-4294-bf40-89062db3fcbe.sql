-- Restrict project_tasks SELECT to owner, assignee, or admin
DROP POLICY IF EXISTS "Authenticated users can view all tasks" ON project_tasks;
CREATE POLICY "Tasks visible to owner assignee or admin" ON project_tasks
  FOR SELECT
  USING (
    auth.uid() = created_by
    OR (auth.uid())::text = assignee_id
    OR is_admin_or_higher()
  );