-- Tighten UPDATE: only the creator or admins can update
DROP POLICY IF EXISTS "All authenticated users can update todos" ON public.todos;
CREATE POLICY "Creator or admin can update todos"
ON public.todos FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR is_admin_or_higher());

-- Tighten DELETE: only the creator or admins can delete
DROP POLICY IF EXISTS "All authenticated users can delete todos" ON public.todos;
CREATE POLICY "Creator or admin can delete todos"
ON public.todos FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR is_admin_or_higher());