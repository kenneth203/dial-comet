-- Restrict project_tasks SELECT to creator, assignee, or admin
-- Matches the existing UPDATE policy's access model
DROP POLICY IF EXISTS "All authenticated users can view tasks" ON public.project_tasks;

CREATE POLICY "Tasks visible to creator assignee or admin"
  ON public.project_tasks FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    OR (auth.uid())::text = assignee_id
    OR is_admin_or_higher()
  );