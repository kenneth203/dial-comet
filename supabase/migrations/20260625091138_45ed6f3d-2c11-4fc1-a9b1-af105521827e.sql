ALTER TABLE public.project_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_logs REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='checklist_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_logs';
  END IF;
END$$;