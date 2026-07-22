ALTER TABLE public.todos REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_instances REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.todos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_instances;