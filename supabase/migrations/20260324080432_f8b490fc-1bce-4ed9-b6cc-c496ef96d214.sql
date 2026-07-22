
-- Create task_attachments tracking table
CREATE TABLE public.task_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view task attachments"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_tasks pt
      WHERE pt.id = task_attachments.task_id
      AND (pt.created_by = auth.uid() OR pt.assignee_id = auth.uid()::text OR is_admin_or_higher())
    )
  );

CREATE POLICY "Users can add task attachments"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_tasks pt
      WHERE pt.id = task_attachments.task_id
      AND (pt.created_by = auth.uid() OR pt.assignee_id = auth.uid()::text OR is_admin_or_higher())
    )
  );

CREATE POLICY "Users can delete own task attachments"
  ON public.task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR is_admin_or_higher());

CREATE POLICY "Authenticated users can upload task attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "Authenticated users can read task attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments');

CREATE POLICY "Authenticated users can delete task attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments');

CREATE OR REPLACE FUNCTION public.cleanup_task_attachment_files()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects WHERE bucket_id = 'task-attachments' AND name = OLD.file_path;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_cleanup_task_attachment_files
  AFTER DELETE ON public.task_attachments
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_task_attachment_files();
