DROP POLICY IF EXISTS "checklist_logs_insert" ON public.checklist_logs;

CREATE POLICY "checklist_logs_insert"
ON public.checklist_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (
    user_id IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.checklist_instances ci
      WHERE ci.id = checklist_logs.instance_id
        AND ci.user_id = auth.uid()
    )
  )
  OR is_admin_or_higher()
);