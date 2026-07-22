DROP POLICY IF EXISTS todos_update_scoped ON public.todos;
CREATE POLICY todos_update_scoped ON public.todos
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR auth.uid()::text = ANY(string_to_array(COALESCE(assignee_id, ''), ','))
    OR EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.user_id = auth.uid()
        AND su.id::text = ANY(string_to_array(COALESCE(todos.assignee_id, ''), ','))
    )
    OR auth.uid()::text = ANY(COALESCE(mentioned_users, ARRAY[]::text[]))
    OR public.is_admin_or_higher()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR auth.uid()::text = ANY(string_to_array(COALESCE(assignee_id, ''), ','))
    OR EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.user_id = auth.uid()
        AND su.id::text = ANY(string_to_array(COALESCE(todos.assignee_id, ''), ','))
    )
    OR auth.uid()::text = ANY(COALESCE(mentioned_users, ARRAY[]::text[]))
    OR public.is_admin_or_higher()
  );

DROP POLICY IF EXISTS todos_delete_scoped ON public.todos;
CREATE POLICY todos_delete_scoped ON public.todos
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR auth.uid()::text = ANY(string_to_array(COALESCE(assignee_id, ''), ','))
    OR EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.user_id = auth.uid()
        AND su.id::text = ANY(string_to_array(COALESCE(todos.assignee_id, ''), ','))
    )
    OR public.is_admin_or_higher()
  );

DROP POLICY IF EXISTS tasks_update_auth ON public.project_tasks;
CREATE POLICY tasks_update_auth ON public.project_tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()::text
    OR auth.uid()::text = ANY(string_to_array(COALESCE(assignee_id, ''), ','))
    OR EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.user_id = auth.uid()
        AND su.id::text = ANY(string_to_array(COALESCE(project_tasks.assignee_id, ''), ','))
    )
    OR public.is_admin_or_higher()
  )
  WITH CHECK (
    created_by = auth.uid()
    OR assignee_id = auth.uid()::text
    OR auth.uid()::text = ANY(string_to_array(COALESCE(assignee_id, ''), ','))
    OR EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.user_id = auth.uid()
        AND su.id::text = ANY(string_to_array(COALESCE(project_tasks.assignee_id, ''), ','))
    )
    OR public.is_admin_or_higher()
  );

DROP POLICY IF EXISTS tasks_delete_owner_or_admin ON public.project_tasks;
CREATE POLICY tasks_delete_owner_or_admin ON public.project_tasks
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_permission('task_manager', 'delete')
    AND (
      created_by = auth.uid()
      OR assignee_id = auth.uid()::text
      OR auth.uid()::text = ANY(string_to_array(COALESCE(assignee_id, ''), ','))
      OR EXISTS (
        SELECT 1
        FROM public.system_users su
        WHERE su.user_id = auth.uid()
          AND su.id::text = ANY(string_to_array(COALESCE(project_tasks.assignee_id, ''), ','))
      )
      OR public.is_admin_or_higher()
    )
  );