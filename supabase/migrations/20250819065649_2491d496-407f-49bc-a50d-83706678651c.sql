-- Fix the Security Definer view issue by removing the view and updating functions

-- Drop the problematic view
DROP VIEW IF EXISTS public.user_basic_profile;

-- Update the get_basic_profile_data function to be more restrictive
CREATE OR REPLACE FUNCTION public.get_my_basic_profile_secure()
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
  WHERE cu.auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- Drop the old function
DROP FUNCTION IF EXISTS public.get_basic_profile_data();