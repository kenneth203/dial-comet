-- Restrict DELETE to task creator or admin roles
DROP POLICY IF EXISTS "Authenticated users can delete tasks" ON project_tasks;
CREATE POLICY "task_delete_creator_or_admin" ON project_tasks
  FOR DELETE USING (
    auth.uid() = created_by
    OR is_admin_or_higher()
  );

-- Restrict UPDATE to task creator, assignee, or admin roles
DROP POLICY IF EXISTS "Authenticated users can update tasks" ON project_tasks;
CREATE POLICY "task_update_creator_assignee_or_admin" ON project_tasks
  FOR UPDATE USING (
    auth.uid() = created_by
    OR auth.uid()::text = assignee_id
    OR is_admin_or_higher()
  ) WITH CHECK (
    auth.uid() = created_by
    OR auth.uid()::text = assignee_id
    OR is_admin_or_higher()
  );