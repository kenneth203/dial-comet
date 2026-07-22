DROP POLICY "System can insert audit log" ON public.shift_audit_log;
CREATE POLICY "Authenticated users can insert audit log"
ON public.shift_audit_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);