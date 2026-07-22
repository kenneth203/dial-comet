-- Create project_tasks table
CREATE TABLE public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  customer_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new_task',
  start_time BIGINT,
  end_time BIGINT,
  total_time NUMERIC,
  billable_time NUMERIC,
  is_timer_running BOOLEAN DEFAULT false,
  cost NUMERIC,
  notes TEXT,
  is_internal BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all tasks"
  ON public.project_tasks FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create tasks"
  ON public.project_tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update tasks"
  ON public.project_tasks FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete tasks"
  ON public.project_tasks FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;

CREATE OR REPLACE FUNCTION update_project_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_tasks_updated_at
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_project_tasks_updated_at();

CREATE OR REPLACE FUNCTION public.cleanup_old_completed_tasks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.project_tasks
  WHERE status = 'completed'
    AND completed_at < now() - interval '90 days';
$$;