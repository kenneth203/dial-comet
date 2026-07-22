
-- Allow all authenticated users to SEE all Daily Handover (todos) and Task Manager (project_tasks) items
-- Edit/delete permissions remain scoped to owner/assignee/admin.

DROP POLICY IF EXISTS todos_select_scoped ON public.todos;
CREATE POLICY todos_select_all_auth ON public.todos
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS tasks_select_scoped ON public.project_tasks;
CREATE POLICY tasks_select_all_auth ON public.project_tasks
  FOR SELECT TO authenticated
  USING (true);

-- Also allow all authenticated users to view checklist_instances/logs (team-wide visibility)
DROP POLICY IF EXISTS checklist_instances_select ON public.checklist_instances;
CREATE POLICY checklist_instances_select_all ON public.checklist_instances
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS checklist_logs_select ON public.checklist_logs;
CREATE POLICY checklist_logs_select_all ON public.checklist_logs
  FOR SELECT TO authenticated
  USING (true);

-- Ensure realtime is enabled (idempotent guards)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.todos; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_instances; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.todos REPLICA IDENTITY FULL;
ALTER TABLE public.project_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_instances REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_logs REPLICA IDENTITY FULL;
