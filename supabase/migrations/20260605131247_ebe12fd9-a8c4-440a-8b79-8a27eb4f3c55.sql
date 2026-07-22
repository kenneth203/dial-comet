DROP POLICY IF EXISTS "todos_select_auth" ON public.todos;
CREATE POLICY "todos_select_scoped" ON public.todos
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR auth.uid()::text = ANY(mentioned_users)
    OR public.is_admin_or_higher()
  );

DROP POLICY IF EXISTS "tasks_select_auth" ON public.project_tasks;
CREATE POLICY "tasks_select_scoped" ON public.project_tasks
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR public.is_admin_or_higher()
  );