-- 1. news_items: open SELECT to all authenticated users
DROP POLICY IF EXISTS "Users can view their own news items" ON news_items;
CREATE POLICY "All authenticated users can view news items"
  ON news_items FOR SELECT TO authenticated USING (true);

-- 2. todos: open SELECT to all authenticated users
DROP POLICY IF EXISTS "Todos visible to owner assignee or admin" ON todos;
CREATE POLICY "All authenticated users can view todos"
  ON todos FOR SELECT TO authenticated USING (true);

-- 3. project_tasks: open SELECT to all authenticated users
DROP POLICY IF EXISTS "Tasks visible to creator assignee or admin" ON project_tasks;
CREATE POLICY "All authenticated users can view project tasks"
  ON project_tasks FOR SELECT TO authenticated USING (true);