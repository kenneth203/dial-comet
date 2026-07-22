-- Complete security implementation for comprehensive_users table

-- Create enhanced role checking functions
CREATE OR REPLACE FUNCTION public.is_hr_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
  );
$$;

-- Function to check if user can access sensitive data
CREATE OR REPLACE FUNCTION public.can_access_sensitive_employee_data()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
  );
$$;

-- Add audit logging for sensitive data access
CREATE TABLE IF NOT EXISTS public.sensitive_data_audit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  accessed_by uuid REFERENCES auth.users(id),
  employee_id text,
  action text,
  timestamp timestamp with time zone DEFAULT NOW(),
  ip_address inet,
  user_agent text
);

-- Enable RLS on audit table
ALTER TABLE public.sensitive_data_audit ENABLE ROW LEVEL SECURITY;

-- Only HR and Admins can view audit logs
CREATE POLICY "Only HR and Admins can view audit logs"
ON public.sensitive_data_audit
FOR SELECT
USING (can_access_sensitive_employee_data());

-- Function to log sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(
  employee_id text,
  action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action
  ) VALUES (
    auth.uid(),
    employee_id,
    action
  );
END;
$$;