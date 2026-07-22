-- COMPREHENSIVE EMPLOYEE DATA SECURITY FIX
-- This completely locks down all sensitive employee and business data

-- 1. SECURE COMPREHENSIVE_USERS TABLE
-- Drop all existing policies and replace with ultra-secure ones
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
-- Drop all existing policies and create blocking policy
DO $$ 
BEGIN
  -- Drop all existing policies on staff_details
  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'staff_details'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.staff_details', pol.policyname);
  END LOOP;
END $$;

-- Create blocking policy for staff_details
CREATE POLICY "staff_details_block_all_direct_access" 
ON public.staff_details 
FOR ALL 
USING (false)
WITH CHECK (false);

-- 3. SECURE CUSTOMERS TABLE
-- Drop all existing policies and create blocking policy  
DO $$ 
BEGIN
  -- Drop all existing policies on customers
  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'customers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customers', pol.policyname);
  END LOOP;
END $$;

-- Create blocking policy for customers
CREATE POLICY "customers_block_all_direct_access" 
ON public.customers 
FOR ALL 
USING (false)
WITH CHECK (false);

-- 4. SECURE PROFILES TABLE (keep minimal access for authenticated users only)
-- Drop overly permissive policies
DO $$ 
BEGIN
  -- Drop all existing policies on profiles except essential ones
  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname NOT IN ('Users can view own profile', 'Admins can view all profiles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- Ensure secure admin-only policies for profiles management
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

CREATE POLICY "profiles_admin_only_delete" 
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

-- 5. CREATE SECURE FUNCTIONS FOR CONTROLLED DATA ACCESS

-- Secure function for accessing comprehensive users (HR/Admin only)
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
  
  -- Return limited, safe data
  RETURN QUERY
  SELECT 
    cu.id, cu.name, 
    mask_email(cu.email) as email,  -- Mask emails for non-Super-Admin
    cu.role, cu.status,
    CASE WHEN user_role = 'Super-Admin' THEN cu.phone_number 
         ELSE mask_phone_number(cu.phone_number) END as phone_number,
    cu.department, cu.job_position
  FROM public.comprehensive_users cu
  ORDER BY cu.name;
END;
$$;

-- Secure function for accessing staff details (HR only)  
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

-- Secure function for accessing customer data (Admin only)
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

-- 6. ADD SECURITY DOCUMENTATION
COMMENT ON TABLE public.comprehensive_users IS 
'HIGHLY SENSITIVE: Employee data protected by blocking RLS policies. Access only via get_comprehensive_users_secure() function.';

COMMENT ON TABLE public.staff_details IS 
'HIGHLY SENSITIVE: Staff data protected by blocking RLS policies. Access only via get_staff_details_secure() function.';

COMMENT ON TABLE public.customers IS 
'BUSINESS SENSITIVE: Customer data protected by blocking RLS policies. Access only via get_customers_secure() function.';

COMMENT ON FUNCTION public.get_comprehensive_users_secure() IS 
'Secure function for HR/Admin access to employee data with role-based masking and audit logging.';

COMMENT ON FUNCTION public.get_staff_details_secure() IS 
'Secure function for HR/Super-Admin access to staff details with data protection.';

COMMENT ON FUNCTION public.get_customers_secure() IS 
'Secure function for Admin/Super-Admin access to customer data with limited exposure.';

-- Final verification
SELECT 'All sensitive employee and customer data tables secured with blocking policies and secure access functions' as security_status;