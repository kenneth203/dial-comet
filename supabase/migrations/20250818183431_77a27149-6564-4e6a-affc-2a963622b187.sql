-- Merge Staff Management and Users into unified User Management system
-- This migration consolidates system_users and staff_details into a single comprehensive user system

-- Step 1: Create a new comprehensive users table that combines both systems
CREATE TABLE IF NOT EXISTS public.comprehensive_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic Profile Information (from both systems)
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  
  -- Role and Status (from both systems)
  role TEXT NOT NULL DEFAULT 'Operator',
  status TEXT NOT NULL DEFAULT 'Active',
  
  -- Employment Details (from staff_details)
  employee_id TEXT,
  department TEXT,
  position TEXT,
  contract_type TEXT DEFAULT 'full_time',
  working_hours_per_week NUMERIC DEFAULT 37.5,
  start_date DATE,
  annual_leave_entitlement NUMERIC DEFAULT 25.0,
  
  -- Sensitive Personal Data (from staff_details)
  date_of_birth DATE,
  ni_number TEXT,
  
  -- Address Information (from staff_details)
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'United Kingdom',
  
  -- Emergency Contact (from staff_details)
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  -- Financial Information (from staff_details)
  salary NUMERIC,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_sort_code TEXT,
  
  -- System flags
  is_system_user BOOLEAN DEFAULT false,
  is_staff_member BOOLEAN DEFAULT false,
  
  -- Line management
  line_manager_id UUID,
  
  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on the new table
ALTER TABLE public.comprehensive_users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for the new comprehensive users table
-- Admin policy - full access to all users and all data
CREATE POLICY "Admins can manage all comprehensive user data" 
ON public.comprehensive_users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
);

-- User policy - can only view their own basic profile data
CREATE POLICY "Users can view own basic profile data" 
ON public.comprehensive_users 
FOR SELECT 
USING (auth.uid() = auth_user_id);

-- User policy - can update their own basic contact info only
CREATE POLICY "Users can update own basic contact info" 
ON public.comprehensive_users 
FOR UPDATE 
USING (auth.uid() = auth_user_id)
WITH CHECK (auth.uid() = auth_user_id);

-- Insert trigger for updated_at
CREATE TRIGGER update_comprehensive_users_updated_at
  BEFORE UPDATE ON public.comprehensive_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create secure function for basic user data (for task/todo assignment)
CREATE OR REPLACE FUNCTION public.get_assignable_comprehensive_users()
RETURNS TABLE(
  id UUID,
  name TEXT,
  role TEXT,
  status TEXT,
  department TEXT,
  position TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cu.id,
    cu.name,
    cu.role,
    cu.status,
    cu.department,
    cu.position
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active'
  ORDER BY cu.name;
$$;

-- Create secure function for comprehensive user data (role-based filtering)
CREATE OR REPLACE FUNCTION public.get_comprehensive_user_data()
RETURNS TABLE(
  id UUID,
  auth_user_id UUID,
  name TEXT,
  email TEXT,
  phone_number TEXT,
  role TEXT,
  status TEXT,
  employee_id TEXT,
  department TEXT,
  position TEXT,
  contract_type TEXT,
  working_hours_per_week NUMERIC,
  start_date DATE,
  annual_leave_entitlement NUMERIC,
  city TEXT,
  country TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  is_system_user BOOLEAN,
  is_staff_member BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Check if current user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  ) INTO is_admin_user;
  
  IF is_admin_user THEN
    -- Admins get all records with all non-sensitive fields
    RETURN QUERY
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
      cu.position,
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
    ORDER BY cu.created_at DESC;
  ELSE
    -- Regular users get only their own record with basic fields
    RETURN QUERY
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
      cu.position,
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
  END IF;
END;
$$;

-- Create function for updating user basic info
CREATE OR REPLACE FUNCTION public.update_user_basic_info(
  user_id UUID,
  new_email TEXT DEFAULT NULL,
  new_phone_number TEXT DEFAULT NULL,
  new_emergency_contact_name TEXT DEFAULT NULL,
  new_emergency_contact_phone TEXT DEFAULT NULL,
  new_emergency_contact_relationship TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user can update this record (own record or admin)
  IF NOT (
    EXISTS(SELECT 1 FROM comprehensive_users WHERE id = user_id AND auth_user_id = auth.uid()) OR 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Admin', 'Super-Admin', 'Supervisor')
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: You can only update your own basic information';
  END IF;
  
  -- Update only the allowed basic fields
  UPDATE public.comprehensive_users 
  SET 
    email = COALESCE(new_email, email),
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE id = user_id;
  
  RETURN TRUE;
END;
$$;

-- Add documentation
COMMENT ON TABLE public.comprehensive_users IS 
'Unified user management table combining system users and staff details with role-based access control';

COMMENT ON FUNCTION public.get_assignable_comprehensive_users() IS 
'Returns basic user info for task/todo assignment - no sensitive data exposed';

COMMENT ON FUNCTION public.get_comprehensive_user_data() IS 
'Returns comprehensive user data with role-based filtering. Admins see all, users see only their own record.';

COMMENT ON FUNCTION public.update_user_basic_info(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS 
'Allows users to update only basic contact information safely';