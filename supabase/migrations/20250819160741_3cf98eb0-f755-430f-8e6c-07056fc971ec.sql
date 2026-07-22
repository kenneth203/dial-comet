-- Fix function search path security issues
-- Update functions that don't have proper search_path settings

CREATE OR REPLACE FUNCTION public.get_user_name(user_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT name FROM public.profiles WHERE user_id = user_uuid
$$;

CREATE OR REPLACE FUNCTION public.get_system_user_name(user_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT name FROM public.system_users WHERE id = user_uuid
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN public.get_current_user_role() IN ('Super-Admin', 'Admin', 'Supervisor') THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.can_access_staff_details()
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

CREATE OR REPLACE FUNCTION public.can_access_sensitive_staff_data(record_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_basic_staff_data(record_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Only allow access to own record (sensitive data will be masked by application layer)
  SELECT auth.uid() = record_user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_access_sensitive_financial_data()
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

CREATE OR REPLACE FUNCTION public.validate_admin_action(required_roles text[] DEFAULT ARRAY['Admin'::text, 'Super-Admin'::text])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role::text = ANY(required_roles)
    AND status::text = 'Active'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_assignable_users()
RETURNS TABLE(id uuid, name text, role text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT system_users.id, system_users.name, system_users.role, system_users.status 
  FROM public.system_users 
  WHERE system_users.status = 'Active'
  ORDER BY system_users.name
$$;

CREATE OR REPLACE FUNCTION public.get_assignable_comprehensive_users()
RETURNS TABLE(id uuid, name text, role text, status text, department text, job_position text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.name,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active'
  ORDER BY cu.name;
$$;