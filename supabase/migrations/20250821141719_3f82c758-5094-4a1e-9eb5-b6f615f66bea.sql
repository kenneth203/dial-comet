-- Fix security issue: Add policy to allow users to access their own data
-- while maintaining strict admin-only access for other users' data

-- Add permissive policy to allow users to read their own comprehensive_users record
CREATE POLICY "Users can view their own comprehensive_users record" 
ON public.comprehensive_users 
FOR SELECT 
USING (auth.uid() = auth_user_id);

-- Add function to safely update user's own basic contact information
CREATE OR REPLACE FUNCTION public.update_my_basic_contact_info(
  new_phone_number text DEFAULT NULL,
  new_emergency_contact_name text DEFAULT NULL,
  new_emergency_contact_phone text DEFAULT NULL,
  new_emergency_contact_relationship text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verify user has a record
  IF NOT EXISTS(SELECT 1 FROM comprehensive_users WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No user record found for current user';
  END IF;
  
  -- Update only safe, basic contact fields that users should be able to modify
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

-- Add function to get current user's comprehensive data safely
CREATE OR REPLACE FUNCTION public.get_my_comprehensive_profile()
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
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text,
  is_system_user boolean,
  is_staff_member boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
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
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.address_line1,
    cu.address_line2,
    cu.city,
    cu.postal_code,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid()
  LIMIT 1;
$$;