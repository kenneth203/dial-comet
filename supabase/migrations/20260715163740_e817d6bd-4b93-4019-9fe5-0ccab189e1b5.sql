-- Allow all authenticated users to view call logs for the operator dashboard.
DROP POLICY IF EXISTS "call_logs_select_admin" ON public.call_logs;
CREATE POLICY "call_logs_select_authenticated"
  ON public.call_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);