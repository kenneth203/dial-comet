
DROP POLICY IF EXISTS todos_select_scoped ON public.todos;
DROP POLICY IF EXISTS todos_update_scoped ON public.todos;
DROP POLICY IF EXISTS todos_delete_scoped ON public.todos;

CREATE POLICY todos_select_scoped ON public.todos
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (auth.uid())::text = ANY (string_to_array(COALESCE(assignee_id, ''), ','))
  OR (auth.uid())::text = ANY (mentioned_users)
  OR public.is_admin_or_higher()
);

CREATE POLICY todos_update_scoped ON public.todos
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR (auth.uid())::text = ANY (string_to_array(COALESCE(assignee_id, ''), ','))
  OR (auth.uid())::text = ANY (mentioned_users)
  OR public.is_admin_or_higher()
)
WITH CHECK (
  user_id = auth.uid()
  OR (auth.uid())::text = ANY (string_to_array(COALESCE(assignee_id, ''), ','))
  OR (auth.uid())::text = ANY (mentioned_users)
  OR public.is_admin_or_higher()
);

CREATE POLICY todos_delete_scoped ON public.todos
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR (auth.uid())::text = ANY (string_to_array(COALESCE(assignee_id, ''), ','))
  OR public.is_admin_or_higher()
);
