-- Add missing RPC functions for sensitive data protection hook

-- Function to check if user can access sensitive employee data
CREATE OR REPLACE FUNCTION public.can_access_sensitive_employee_data()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
    AND status = 'Active'
  );
$$;

-- Function to log sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(
  employee_id TEXT,
  action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only log if user has appropriate permissions
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
    AND status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Access denied: Insufficient privileges to access sensitive data';
  END IF;

  -- Insert audit log entry
  INSERT INTO public.sensitive_data_access_log (
    accessed_by,
    employee_user_id,
    data_type,
    access_reason,
    accessed_at
  ) VALUES (
    auth.uid(),
    employee_id::UUID,
    'sensitive_employee_data',
    action,
    NOW()
  );
END;
$$;

-- Remove non-functional SELECT trigger logic from billing
DROP TRIGGER IF EXISTS log_billing_access_trigger ON public.billing_customers;
DROP TRIGGER IF EXISTS log_billing_access_trigger ON public.billing_invoices;