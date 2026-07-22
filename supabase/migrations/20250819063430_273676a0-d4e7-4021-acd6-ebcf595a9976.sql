-- Enhanced security functions and policies for comprehensive_users table
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

-- Secure function to get own basic profile (no sensitive data)
CREATE OR REPLACE FUNCTION public.get_my_basic_profile()
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  phone_number text,
  role text,
  status text,
  department text,
  job_position text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  city text,
  country text
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.city,
    cu.country
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid();
$$;

-- HR/Admin function to get employee directory (basic info only)
CREATE OR REPLACE FUNCTION public.get_employee_directory()
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  role text,
  status text,
  department text,
  job_position text,
  is_system_user boolean,
  is_staff_member boolean
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.name,
    cu.email,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position,
    cu.is_system_user,
    cu.is_staff_member
  FROM public.comprehensive_users cu
  WHERE is_admin_or_higher()
  ORDER BY cu.name;
$$;

-- HR-only function to access sensitive employee data
CREATE OR REPLACE FUNCTION public.get_sensitive_employee_data(employee_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  salary numeric,
  bank_name text,
  bank_account_number text,
  bank_sort_code text,
  ni_number text,
  date_of_birth date,
  address_line1 text,
  address_line2 text,
  postal_code text,
  contract_type text,
  working_hours_per_week numeric,
  start_date date,
  annual_leave_entitlement numeric
)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.name,
    cu.salary,
    cu.bank_name,
    cu.bank_account_number,
    cu.bank_sort_code,
    cu.ni_number,
    cu.date_of_birth,
    cu.address_line1,
    cu.address_line2,
    cu.postal_code,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement
  FROM public.comprehensive_users cu
  WHERE cu.id = employee_id 
    AND can_access_sensitive_employee_data()
  LIMIT 1;
$$;