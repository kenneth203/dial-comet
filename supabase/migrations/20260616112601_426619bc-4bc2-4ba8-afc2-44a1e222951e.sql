-- The UI stores project_tasks.assignee_id as system_users.id (a staff-directory id),
-- not as the auth user id. The previous policies compared assignee_id to auth.uid(),
-- so assignees could never see their own tasks. Resolve the staff id to auth.uid()
-- via system_users so every assignee always sees their tasks, while keeping the
-- admin-or-higher (Supervisor/Admin/Super-Admin) full-visibility rule.

DROP POLICY IF EXISTS tasks_select_scoped ON public.project_tasks;
DROP POLICY IF EXISTS tasks_update_auth ON public.project_tasks;
DROP POLICY IF EXISTS tasks_delete_owner_or_admin ON public.project_tasks;

CREATE POLICY tasks_select_scoped
  ON public.project_tasks
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR assignee_id IN (
      SELECT su.id::text FROM public.system_users su WHERE su.user_id = auth.uid()
    )
    OR public.is_admin_or_higher()
  );

CREATE POLICY tasks_update_auth
  ON public.project_tasks
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR assignee_id IN (
      SELECT su.id::text FROM public.system_users su WHERE su.user_id = auth.uid()
    )
    OR public.is_admin_or_higher()
  );

CREATE POLICY tasks_delete_owner_or_admin
  ON public.project_tasks
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR assignee_id IN (
      SELECT su.id::text FROM public.system_users su WHERE su.user_id = auth.uid()
    )
    OR public.is_admin_or_higher()
  );