DROP POLICY IF EXISTS tasks_delete_owner ON public.project_tasks;

CREATE POLICY tasks_delete_owner_or_admin ON public.project_tasks
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR assignee_id = (auth.uid())::text
  OR public.is_admin_or_higher()
);