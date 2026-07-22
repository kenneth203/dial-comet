-- Drop the restrictive own-only view policy
DROP POLICY IF EXISTS "Users can view their own todos" ON public.todos;

-- Allow all authenticated users to view all todos
CREATE POLICY "All authenticated users can view todos"
ON public.todos FOR SELECT
TO authenticated
USING (true);

-- Also allow all authenticated users to update any todo
DROP POLICY IF EXISTS "Users can update their own todos" ON public.todos;
CREATE POLICY "All authenticated users can update todos"
ON public.todos FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow all authenticated users to delete any todo
DROP POLICY IF EXISTS "Users can delete their own todos" ON public.todos;
CREATE POLICY "All authenticated users can delete todos"
ON public.todos FOR DELETE
TO authenticated
USING (true);