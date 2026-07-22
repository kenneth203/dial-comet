-- 1. todos: allow all authenticated users to view
DROP POLICY IF EXISTS "Todos visible to owner assignee or admin" ON public.todos;
CREATE POLICY "All authenticated users can view todos"
  ON public.todos FOR SELECT
  TO authenticated
  USING (true);

-- 2. project_tasks: allow all authenticated users to view
DROP POLICY IF EXISTS "Tasks visible to owner assignee or admin" ON public.project_tasks;
CREATE POLICY "All authenticated users can view tasks"
  ON public.project_tasks FOR SELECT
  TO authenticated
  USING (true);