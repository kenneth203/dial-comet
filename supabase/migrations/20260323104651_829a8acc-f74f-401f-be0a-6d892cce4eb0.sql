DROP POLICY "Users can view their own assignments" ON public.shift_assignments;
CREATE POLICY "Users can view their own assignments"
  ON public.shift_assignments FOR SELECT
  TO public
  USING (auth.uid() = user_id);