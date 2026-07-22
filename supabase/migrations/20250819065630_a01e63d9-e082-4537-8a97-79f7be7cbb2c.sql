-- Fix RLS policies for comprehensive_users table to prevent sensitive data exposure

-- First, drop all existing conflicting policies
DROP POLICY IF EXISTS "Deny direct user access to comprehensive_users" ON comprehensive_users;
DROP POLICY IF EXISTS "Admins have full access to comprehensive_users" ON comprehensive_users;
DROP POLICY IF EXISTS "Users can only update via secure function" ON comprehensive_users;
DROP POLICY IF EXISTS "Only admins can insert comprehensive users" ON comprehensive_users;
DROP POLICY IF EXISTS "Only admins can delete comprehensive users" ON comprehensive_users;
DROP POLICY IF EXISTS "Users can view own profile only" ON comprehensive_users;
DROP POLICY IF EXISTS "HR and Admins can view all employee data" ON comprehensive_users;
DROP POLICY IF EXISTS "Only HR and Admins can create employee records" ON comprehensive_users;
DROP POLICY IF EXISTS "Restricted update access for employee data" ON comprehensive_users;
DROP POLICY IF EXISTS "Only HR and Admins can delete employee records" ON comprehensive_users;

-- Create security definer function to check if user can access sensitive data
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

-- Create security definer function to get basic user profile (non-sensitive data only)
CREATE OR REPLACE FUNCTION public.get_basic_profile_data()
RETURNS TABLE(
  id uuid,
  auth_user_id uuid, 
  name text,
  email text,
  phone_number text,
  role text,
  status text,
  employee_id text,
  department text,
  job_position text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  city text,
  country text,
  is_system_user boolean,
  is_staff_member boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.city,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid();
$$;

-- Create comprehensive RLS policies with proper separation of concerns

-- 1. HR/Admin can view ALL data (including sensitive financial information)
CREATE POLICY "HR_Admin_full_access_comprehensive_users"
ON comprehensive_users
FOR SELECT
TO authenticated
USING (can_access_sensitive_financial_data());

-- 2. HR/Admin can insert new employee records
CREATE POLICY "HR_Admin_can_insert_comprehensive_users" 
ON comprehensive_users
FOR INSERT
TO authenticated
WITH CHECK (can_access_sensitive_financial_data());

-- 3. HR/Admin can update all employee data
CREATE POLICY "HR_Admin_can_update_comprehensive_users"
ON comprehensive_users
FOR UPDATE  
TO authenticated
USING (can_access_sensitive_financial_data())
WITH CHECK (can_access_sensitive_financial_data());

-- 4. HR/Admin can delete employee records
CREATE POLICY "HR_Admin_can_delete_comprehensive_users"
ON comprehensive_users
FOR DELETE
TO authenticated
USING (can_access_sensitive_financial_data());

-- 5. Regular users CANNOT directly access the comprehensive_users table
-- They must use the security definer function to get only basic profile data
CREATE POLICY "Block_direct_user_access_to_sensitive_data"
ON comprehensive_users  
FOR SELECT
TO authenticated
USING (false);

-- Create a view for basic user profile data that users can access
CREATE OR REPLACE VIEW public.user_basic_profile AS
SELECT * FROM public.get_basic_profile_data();

-- Grant access to the view for authenticated users
GRANT SELECT ON public.user_basic_profile TO authenticated;

-- Update the basic user profile function to allow users to update only safe fields
CREATE OR REPLACE FUNCTION public.update_my_basic_profile(
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
    RAISE EXCEPTION 'No user record found';
  END IF;
  
  -- Update only safe, non-sensitive fields
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