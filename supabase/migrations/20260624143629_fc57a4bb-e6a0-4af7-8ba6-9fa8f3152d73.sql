
-- Helper: can current user access a given project_task (super-admin, creator, or assignee)
CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_tasks t
    LEFT JOIN public.system_users su ON su.id::text = t.assignee_id
    WHERE t.id = p_task_id
      AND (
        public.is_super_admin()
        OR t.created_by = auth.uid()
        OR su.user_id = auth.uid()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_task(uuid) TO authenticated;

-- Replace task_attachments table policies
DROP POLICY IF EXISTS task_att_select_auth ON public.task_attachments;
DROP POLICY IF EXISTS task_att_insert_auth ON public.task_attachments;
DROP POLICY IF EXISTS task_att_delete_owner ON public.task_attachments;

CREATE POLICY task_att_select_scoped ON public.task_attachments
  FOR SELECT TO authenticated
  USING (public.can_access_task(task_id));

CREATE POLICY task_att_insert_scoped ON public.task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.can_access_task(task_id));

CREATE POLICY task_att_delete_scoped ON public.task_attachments
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR uploaded_by = auth.uid() OR public.can_access_task(task_id));

-- Replace storage.objects policies for the task-attachments bucket.
-- File path layout: "<task_id>/<timestamp>_<filename>"
DROP POLICY IF EXISTS task_attachments_select ON storage.objects;
DROP POLICY IF EXISTS task_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS task_attachments_update ON storage.objects;
DROP POLICY IF EXISTS task_attachments_delete ON storage.objects;

CREATE POLICY task_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND public.can_access_task( NULLIF(split_part(name, '/', 1), '')::uuid )
  );

CREATE POLICY task_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND owner = auth.uid()
    AND public.can_access_task( NULLIF(split_part(name, '/', 1), '')::uuid )
  );

CREATE POLICY task_attachments_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (public.is_super_admin() OR owner = auth.uid())
  );

CREATE POLICY task_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (
      public.is_super_admin()
      OR owner = auth.uid()
      OR public.can_access_task( NULLIF(split_part(name, '/', 1), '')::uuid )
    )
  );
