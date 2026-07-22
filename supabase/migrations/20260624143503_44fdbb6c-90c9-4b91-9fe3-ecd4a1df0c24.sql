
CREATE POLICY "task_attachments_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments');

CREATE POLICY "task_attachments_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-attachments' AND owner = auth.uid());

CREATE POLICY "task_attachments_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'task-attachments' AND (owner = auth.uid() OR public.is_admin_or_higher()));

CREATE POLICY "task_attachments_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments' AND (owner = auth.uid() OR public.is_admin_or_higher()));
