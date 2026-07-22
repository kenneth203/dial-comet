
-- Strict admin helper: Admin + Super-Admin only
CREATE OR REPLACE FUNCTION public.is_admin_strictly()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('Super-Admin', 'Admin')
  )
$$;

-- Update billing access helper to exclude Supervisors
CREATE OR REPLACE FUNCTION public.has_billing_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('Super-Admin', 'Admin')
  );
$$;

-- Tighten sensitive financial gate
CREATE OR REPLACE FUNCTION public.can_access_sensitive_financial_data()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_strictly();
$$;

-- Tighten staff data gate
CREATE OR REPLACE FUNCTION public.get_staff_data_secure_with_audit(access_reason text)
RETURNS SETOF public.staff_details
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_strictly() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.staff_data_access_audit (accessed_by, data_type, action)
  VALUES (auth.uid(), 'staff_details', access_reason);

  RETURN QUERY SELECT * FROM public.staff_details ORDER BY name;
END;
$$;

-- Rewrite RLS policies on sensitive tables to use is_admin_strictly()
DO $$
DECLARE
  r record;
  v_tables text[] := ARRAY[
    'employee_financial_data','employee_sensitive_data','staff_details','comprehensive_users',
    'billing_customers','billing_invoices','billing_line_items','billing_periods','billing_settings',
    'billing_data_audit','customer_pricing',
    'internal_billing_periods','internal_invoices','invoice_call_lines','invoice_va_lines',
    'financial_data_audit_enhanced','financial_emergency_access',
    'sensitive_data_access_log','sensitive_data_audit','staff_data_access_audit'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_tables)
      AND (qual ILIKE '%is_admin_or_higher()%' OR with_check ILIKE '%is_admin_or_higher()%')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
      r.policyname,
      r.tablename,
      r.permissive,
      r.cmd,
      array_to_string(r.roles, ', '),
      CASE WHEN r.qual IS NOT NULL
           THEN 'USING (' || replace(r.qual, 'is_admin_or_higher()', 'is_admin_strictly()') || ')'
           ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL
           THEN 'WITH CHECK (' || replace(r.with_check, 'is_admin_or_higher()', 'is_admin_strictly()') || ')'
           ELSE '' END
    );
  END LOOP;
END $$;
