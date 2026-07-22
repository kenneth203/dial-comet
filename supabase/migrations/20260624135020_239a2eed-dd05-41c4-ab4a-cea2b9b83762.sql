
DROP POLICY IF EXISTS todos_delete_own ON public.todos;
DROP POLICY IF EXISTS todos_update_own ON public.todos;

CREATE POLICY todos_delete_scoped ON public.todos
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR assignee_id = (auth.uid())::text
  OR public.is_admin_or_higher()
);

CREATE POLICY todos_update_scoped ON public.todos
FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR assignee_id = (auth.uid())::text
  OR (auth.uid())::text = ANY (mentioned_users)
  OR public.is_admin_or_higher()
)
WITH CHECK (
  auth.uid() = user_id
  OR assignee_id = (auth.uid())::text
  OR (auth.uid())::text = ANY (mentioned_users)
  OR public.is_admin_or_higher()
);
