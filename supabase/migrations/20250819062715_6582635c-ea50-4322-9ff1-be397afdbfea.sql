-- Create secure functions to handle sensitive data access
-- Function to get basic user profile data (safe for regular users)
CREATE OR REPLACE FUNCTION public.get_basic_user_profile()
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
  contract_type text,
  working_hours_per_week numeric,
  start_date date,
  annual_leave_entitlement numeric,
  city text,
  country text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  is_system_user boolean,
  is_staff_member boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE SQL
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
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.city,
    cu.country,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid();
$$;

-- Function to get all basic user profiles (for admins and system use)
CREATE OR REPLACE FUNCTION public.get_all_basic_user_profiles()
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
  contract_type text,
  working_hours_per_week numeric,
  start_date date,
  annual_leave_entitlement numeric,
  city text,
  country text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  is_system_user boolean,
  is_staff_member boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE SQL
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
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.city,
    cu.country,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE is_admin_or_higher() OR cu.auth_user_id = auth.uid();
$$;

-- Function to update basic user info (users can only update their own safe fields)
CREATE OR REPLACE FUNCTION public.update_basic_user_info(
  user_uuid uuid,
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
  -- Check if user is updating their own record or is admin
  IF auth.uid() != user_uuid AND NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: can only update own profile';
  END IF;
  
  -- Verify user record exists
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE auth_user_id = user_uuid) THEN
    RAISE EXCEPTION 'User record not found';
  END IF;
  
  -- Update only safe, basic fields
  UPDATE public.comprehensive_users 
  SET 
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE auth_user_id = user_uuid;
  
  RETURN TRUE;
END;
$$;

-- Update RLS policies to be more restrictive
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own basic profile data" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Users can update own basic contact info" ON public.comprehensive_users;

-- Create new restrictive policies
-- Users can only select via the secure function (no direct table access)
CREATE POLICY "Deny direct user access to comprehensive_users"
ON public.comprehensive_users
FOR SELECT
USING (false);

-- Only admins can directly access the table
CREATE POLICY "Admins have full access to comprehensive_users"
ON public.comprehensive_users
FOR ALL
USING (is_admin_or_higher());

-- Users can only update via the secure function
CREATE POLICY "Users can only update via secure function"
ON public.comprehensive_users
FOR UPDATE
USING (is_admin_or_higher());

-- Only admins can insert new records
CREATE POLICY "Only admins can insert comprehensive users"
ON public.comprehensive_users
FOR INSERT
WITH CHECK (is_admin_or_higher());

-- Only admins can delete records
CREATE POLICY "Only admins can delete comprehensive users"
ON public.comprehensive_users
FOR DELETE
USING (is_admin_or_higher());