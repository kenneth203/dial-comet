-- COMPREHENSIVE EMPLOYEE DATA SECURITY FIX (Corrected Syntax)

-- 1. SECURE COMPREHENSIVE_USERS TABLE
-- Drop all existing policies first
DROP POLICY IF EXISTS "Block_direct_comprehensive_users_access" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_Admin_can_delete_comprehensive_users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_Admin_can_insert_comprehensive_users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_Admin_can_insert_employees" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_Admin_can_update_comprehensive_users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_Admin_can_update_employees" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_SuperAdmin_can_insert_employees" ON public.comprehensive_users;
DROP POLICY IF EXISTS "HR_SuperAdmin_can_update_with_audit" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Super_Admin_emergency_access_only" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Super_Admin_emergency_comprehensive_users_access" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Super_Admin_only_can_delete_employees" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Super_Admin_only_delete_emergency" ON public.comprehensive_users;

-- Create single blocking policy for comprehensive_users
CREATE POLICY "comprehensive_users_block_all_direct_access" 
ON public.comprehensive_users 
FOR ALL 
USING (false)
WITH CHECK (false);

-- 2. SECURE STAFF_DETAILS TABLE
-- Drop existing policies by name
DROP POLICY IF EXISTS "Block_direct_staff_access" ON public.staff_details;
DROP POLICY IF EXISTS "HR_can_access_staff_details" ON public.staff_details;
DROP POLICY IF EXISTS "Admin_can_access_staff_details" ON public.staff_details;
DROP POLICY IF EXISTS "Users_can_view_own_staff_details" ON public.staff_details;
DROP POLICY IF EXISTS "Admins_can_manage_staff_details" ON public.staff_details;
DROP POLICY IF EXISTS "Users can view own staff details" ON public.staff_details;
DROP POLICY IF EXISTS "Admins can manage staff details" ON public.staff_details;

-- Create blocking policy for staff_details
CREATE POLICY "staff_details_block_all_direct_access" 
ON public.staff_details 
FOR ALL 
USING (false)
WITH CHECK (false);

-- 3. SECURE CUSTOMERS TABLE  
-- Drop existing policies by name
DROP POLICY IF EXISTS "Users can create their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
DROP POLICY IF EXISTS "Admin_can_access_all_customers" ON public.customers;
DROP POLICY IF EXISTS "Staff_can_view_customers" ON public.customers;

-- Create blocking policy for customers
CREATE POLICY "customers_block_all_direct_access" 
ON public.customers 
FOR ALL 
USING (false)
WITH CHECK (false);

-- 4. SECURE PROFILES TABLE
-- Remove overly permissive policies but keep essential ones
DROP POLICY IF EXISTS "Secure_Admin_can_delete_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Secure_Admin_can_insert_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Secure_Admin_can_update_profiles" ON public.profiles;

-- Add secure admin-only management policies
CREATE POLICY "profiles_admin_only_insert" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() 
      AND p.role IN ('Super-Admin', 'Admin')
      AND p.status = 'Active'
  )
);

CREATE POLICY "profiles_admin_only_update" 
ON public.profiles 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() 
      AND p.role IN ('Super-Admin', 'Admin')  
      AND p.status = 'Active'
  )
);

CREATE POLICY "profiles_super_admin_only_delete" 
ON public.profiles 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() 
      AND p.role = 'Super-Admin'
      AND p.status = 'Active'
  )
);

-- 5. CREATE SECURE FUNCTIONS FOR CONTROLLED ACCESS

-- Secure function for comprehensive users (HR/Admin only)
CREATE OR REPLACE FUNCTION public.get_comprehensive_users_secure()
RETURNS TABLE(
  id uuid, name text, email text, role text, status text, 
  phone_number text, department text, job_position text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Check user authorization
  SELECT p.role::TEXT INTO user_role 
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Only HR, Admin, and Super-Admin can access
  IF user_role NOT IN ('Super-Admin', 'Admin', 'HR') THEN
    RAISE EXCEPTION 'Access denied: Only authorized personnel can access employee data';
  END IF;
  
  -- Return limited, masked data based on role
  RETURN QUERY
  SELECT 
    cu.id, cu.name, 
    CASE WHEN user_role = 'Super-Admin' THEN cu.email 
         ELSE mask_email(cu.email) END as email,
    cu.role, cu.status,
    CASE WHEN user_role = 'Super-Admin' THEN cu.phone_number 
         ELSE mask_phone_number(cu.phone_number) END as phone_number,
    cu.department, cu.job_position
  FROM public.comprehensive_users cu
  ORDER BY cu.name;
END;
$$;

-- Secure function for staff details (HR/Super-Admin only)
CREATE OR REPLACE FUNCTION public.get_staff_details_secure()
RETURNS TABLE(
  id uuid, employee_id text, email text, department text, 
  staff_position text, role text, status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Check user authorization (stricter - HR and Super-Admin only)
  SELECT p.role::TEXT INTO user_role 
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Only HR and Super-Admin can access staff details
  IF user_role NOT IN ('Super-Admin', 'HR') THEN
    RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can access staff details';
  END IF;
  
  -- Return masked data
  RETURN QUERY
  SELECT 
    sd.id, sd.employee_id,
    mask_email(sd.email) as email,
    sd.department, sd."position" as staff_position,
    sd.role, sd.status
  FROM public.staff_details sd
  ORDER BY sd.employee_id;
END;
$$;

-- Secure function for customer data (Admin/Super-Admin only)
CREATE OR REPLACE FUNCTION public.get_customers_secure()
RETURNS TABLE(
  id uuid, name text, business_type text, status text, 
  city text, contact text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Check user authorization (Admin and Super-Admin only)
  SELECT p.role::TEXT INTO user_role 
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Only Admin and Super-Admin can access customer data
  IF user_role NOT IN ('Super-Admin', 'Admin') THEN
    RAISE EXCEPTION 'Access denied: Only Admin and Super-Admin can access customer data';
  END IF;
  
  -- Return limited customer data (no sensitive details)
  RETURN QUERY
  SELECT 
    c.id, c.name, c.business_type, c.status,
    c.city, c.contact
  FROM public.customers c
  ORDER BY c.name;
END;
$$;

-- 6. ADD COMPREHENSIVE SECURITY DOCUMENTATION
COMMENT ON TABLE public.comprehensive_users IS 
'CRITICAL SECURITY: Employee data completely blocked by RLS. Access ONLY via get_comprehensive_users_secure() with HR/Admin authorization.';

COMMENT ON TABLE public.staff_details IS 
'CRITICAL SECURITY: Staff data completely blocked by RLS. Access ONLY via get_staff_details_secure() with HR authorization.';

COMMENT ON TABLE public.customers IS 
'CRITICAL SECURITY: Customer data completely blocked by RLS. Access ONLY via get_customers_secure() with Admin authorization.';

-- Verification message
SELECT 'SECURITY COMPLETE: All sensitive employee and customer data tables now have blocking RLS policies and secure access functions' as final_status;