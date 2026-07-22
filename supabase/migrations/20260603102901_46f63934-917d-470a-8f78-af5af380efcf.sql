-- Restrict direct SELECT on sensitive PII tables to admins only.
-- Owning users must access this data through audited SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS emp_fin_select_admin ON public.employee_financial_data;
CREATE POLICY emp_fin_select_admin ON public.employee_financial_data
  FOR SELECT TO authenticated
  USING (is_admin_or_higher());

DROP POLICY IF EXISTS emp_sens_select_admin ON public.employee_sensitive_data;
CREATE POLICY emp_sens_select_admin ON public.employee_sensitive_data
  FOR SELECT TO authenticated
  USING (is_admin_or_higher());