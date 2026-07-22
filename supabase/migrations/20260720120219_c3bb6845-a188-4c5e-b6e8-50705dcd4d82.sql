DROP POLICY IF EXISTS call_logs_select_authenticated ON public.call_logs;
DROP POLICY IF EXISTS call_logs_select_admin ON public.call_logs;
CREATE POLICY call_logs_select_admin ON public.call_logs FOR SELECT TO authenticated USING (public.is_admin_or_higher());