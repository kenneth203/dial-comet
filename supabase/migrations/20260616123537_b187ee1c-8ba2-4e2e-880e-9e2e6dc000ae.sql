
CREATE OR REPLACE FUNCTION public.current_user_has_permission(_section text, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT apg.granted
    FROM public.profiles p
    JOIN public.app_permissions ap
      ON ap.section = _section AND ap.feature = _feature
    LEFT JOIN public.app_permission_grants apg
      ON apg.permission_id = ap.id
     AND apg.role = p.role::text
    WHERE p.user_id = auth.uid()
    LIMIT 1
  ), false)
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role::text = 'Super-Admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text, text) TO authenticated;

DROP POLICY IF EXISTS tasks_delete_owner_or_admin ON public.project_tasks;

CREATE POLICY tasks_delete_owner_or_admin
ON public.project_tasks
FOR DELETE
TO authenticated
USING (
  public.current_user_has_permission('task_manager', 'delete')
  AND (
    created_by = auth.uid()
    OR assignee_id = (auth.uid())::text
    OR assignee_id IN (
      SELECT (su.id)::text FROM public.system_users su WHERE su.user_id = auth.uid()
    )
    OR public.is_admin_or_higher()
  )
);
