-- 1) Checklist logs: require user_id = auth.uid() on every insert (incl. admins)
DROP POLICY IF EXISTS checklist_logs_insert ON public.checklist_logs;
CREATE POLICY checklist_logs_insert ON public.checklist_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NOT NULL
    AND user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.checklist_instances ci
        WHERE ci.id = checklist_logs.instance_id
          AND (ci.user_id = auth.uid() OR public.is_admin_or_higher())
      )
    )
  );

-- 2) Project tasks: restrict policies to authenticated role only
DROP POLICY IF EXISTS tasks_select_scoped ON public.project_tasks;
CREATE POLICY tasks_select_scoped ON public.project_tasks
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR assignee_id IN (
      SELECT (su.id)::text FROM public.system_users su WHERE su.user_id = auth.uid()
    )
    OR public.is_admin_or_higher()
  );

DROP POLICY IF EXISTS tasks_update_auth ON public.project_tasks;
CREATE POLICY tasks_update_auth ON public.project_tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR assignee_id IN (
      SELECT (su.id)::text FROM public.system_users su WHERE su.user_id = auth.uid()
    )
    OR public.is_admin_or_higher()
  );