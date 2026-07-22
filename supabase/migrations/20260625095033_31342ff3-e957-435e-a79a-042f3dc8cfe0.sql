CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_tasks t
    WHERE t.id = p_task_id
      AND (
        public.is_admin_or_higher()
        OR t.created_by = auth.uid()
        OR t.assignee_id = (auth.uid())::text
        OR (auth.uid())::text = ANY(string_to_array(COALESCE(t.assignee_id,''), ','))
        OR EXISTS (
          SELECT 1 FROM public.system_users su
          WHERE su.user_id = auth.uid()
            AND (
              su.id::text = t.assignee_id
              OR su.id::text = ANY(string_to_array(COALESCE(t.assignee_id,''), ','))
            )
        )
      )
  );
$function$;