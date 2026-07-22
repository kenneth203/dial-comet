-- Fix 1: Restrict shift_templates INSERT to admins only
DROP POLICY "Authenticated users can insert shift templates" ON public.shift_templates;

CREATE POLICY "Admins can insert shift templates"
ON public.shift_templates
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_higher());

-- Fix 2: Prevent forged audit log entries
DROP POLICY "Authenticated users can insert audit log" ON public.shift_audit_log;

CREATE POLICY "Users can only log own actions"
ON public.shift_audit_log
FOR INSERT
TO authenticated
WITH CHECK (performed_by = auth.uid());