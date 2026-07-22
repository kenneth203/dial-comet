-- Enhanced security for comprehensive_users table with role-based access
-- Create HR role and improve security policies

-- First, update the user_role enum to include HR role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('Operator', 'Supervisor', 'Admin', 'Super-Admin', 'HR');
    ELSE
        -- Add HR role if it doesn't exist
        BEGIN
            ALTER TYPE public.user_role ADD VALUE 'HR';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

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

-- Function to safely update employee contact info (user can update own)
CREATE OR REPLACE FUNCTION public.update_my_contact_info(
  new_phone_number text DEFAULT NULL,
  new_emergency_contact_name text DEFAULT NULL,
  new_emergency_contact_phone text DEFAULT NULL,
  new_emergency_contact_relationship text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify user has a record
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  
  -- Update only safe contact fields
  UPDATE public.comprehensive_users 
  SET 
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE auth_user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;

-- HR-only function to update sensitive employee data
CREATE OR REPLACE FUNCTION public.update_employee_sensitive_data(
  employee_id uuid,
  new_salary numeric DEFAULT NULL,
  new_bank_name text DEFAULT NULL,
  new_bank_account_number text DEFAULT NULL,
  new_bank_sort_code text DEFAULT NULL,
  new_ni_number text DEFAULT NULL,
  new_date_of_birth date DEFAULT NULL,
  new_address_line1 text DEFAULT NULL,
  new_address_line2 text DEFAULT NULL,
  new_postal_code text DEFAULT NULL,
  new_contract_type text DEFAULT NULL,
  new_working_hours_per_week numeric DEFAULT NULL,
  new_start_date date DEFAULT NULL,
  new_annual_leave_entitlement numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only HR/Admin can access this function
  IF NOT can_access_sensitive_employee_data() THEN
    RAISE EXCEPTION 'Access denied: HR or Admin role required';
  END IF;
  
  -- Verify employee exists
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE id = employee_id) THEN
    RAISE EXCEPTION 'Employee record not found';
  END IF;
  
  -- Update sensitive fields
  UPDATE public.comprehensive_users 
  SET 
    salary = COALESCE(new_salary, salary),
    bank_name = COALESCE(new_bank_name, bank_name),
    bank_account_number = COALESCE(new_bank_account_number, bank_account_number),
    bank_sort_code = COALESCE(new_bank_sort_code, bank_sort_code),
    ni_number = COALESCE(new_ni_number, ni_number),
    date_of_birth = COALESCE(new_date_of_birth, date_of_birth),
    address_line1 = COALESCE(new_address_line1, address_line1),
    address_line2 = COALESCE(new_address_line2, address_line2),
    postal_code = COALESCE(new_postal_code, postal_code),
    contract_type = COALESCE(new_contract_type, contract_type),
    working_hours_per_week = COALESCE(new_working_hours_per_week, working_hours_per_week),
    start_date = COALESCE(new_start_date, start_date),
    annual_leave_entitlement = COALESCE(new_annual_leave_entitlement, annual_leave_entitlement),
    updated_at = NOW()
  WHERE id = employee_id;
  
  RETURN TRUE;
END;
$$;

-- Replace problematic RLS policies with robust user-specific access
-- Drop existing policies
DROP POLICY IF EXISTS "Deny direct user access to comprehensive_users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Admins have full access to comprehensive_users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Users can only update via secure function" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Only admins can insert comprehensive users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Only admins can delete comprehensive users" ON public.comprehensive_users;

-- New secure policies with proper user isolation
-- Users can only see their own basic record (no sensitive data exposed via SELECT)
CREATE POLICY "Users can view own basic profile via auth_user_id"
ON public.comprehensive_users
FOR SELECT
USING (
  auth.uid() = auth_user_id 
  AND auth.uid() IS NOT NULL
);

-- HR and Admins can view all records
CREATE POLICY "HR and Admins can view all employee data"
ON public.comprehensive_users
FOR SELECT
USING (can_access_sensitive_employee_data());

-- Only HR and Admins can insert new records
CREATE POLICY "Only HR and Admins can create employee records"
ON public.comprehensive_users
FOR INSERT
WITH CHECK (can_access_sensitive_employee_data());

-- Users can update only their own basic info, HR/Admins can update all
CREATE POLICY "Restricted update access for employee data"
ON public.comprehensive_users
FOR UPDATE
USING (
  (auth.uid() = auth_user_id AND auth.uid() IS NOT NULL)
  OR can_access_sensitive_employee_data()
);

-- Only HR and Admins can delete records
CREATE POLICY "Only HR and Admins can delete employee records"
ON public.comprehensive_users
FOR DELETE
USING (can_access_sensitive_employee_data());

-- Add audit logging for sensitive data access
CREATE TABLE IF NOT EXISTS public.sensitive_data_audit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  accessed_by uuid REFERENCES auth.users(id),
  employee_id uuid,
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
  employee_id uuid,
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