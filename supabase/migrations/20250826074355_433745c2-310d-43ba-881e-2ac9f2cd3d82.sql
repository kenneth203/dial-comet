-- Fix security warning: Function Search Path Mutable
-- Update the function to have proper search_path security

DROP FUNCTION IF EXISTS public.get_employee_data_secure(uuid);

CREATE OR REPLACE FUNCTION public.get_employee_data_secure(target_user_id uuid DEFAULT NULL)
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
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  is_hr_admin boolean := false;
  query_user_id uuid;
BEGIN
  -- Check if user has HR/Admin privileges
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR'::user_role, 'Admin'::user_role, 'Super-Admin'::user_role)
    AND status = 'Active'::user_status
  ) INTO is_hr_admin;
  
  -- Determine target user (self if not specified or not admin)
  IF target_user_id IS NULL OR NOT is_hr_admin THEN
    query_user_id := auth.uid();
  ELSE
    query_user_id := target_user_id;
  END IF;
  
  -- Log access to sensitive data
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action,
    timestamp
  ) VALUES (
    auth.uid(),
    query_user_id::text,
    'SECURE_ACCESS_COMPREHENSIVE_USERS',
    NOW()
  );
  
  -- Return data with appropriate masking
  RETURN QUERY
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    -- Mask email for non-admin users viewing others
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.email
      ELSE LEFT(cu.email, 3) || '***@' || RIGHT(cu.email, 10)
    END as email,
    -- Mask phone for non-admin users viewing others  
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.phone_number
      ELSE '***-***-' || RIGHT(cu.phone_number, 4)
    END as phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    -- Emergency contacts only for admin or self
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.emergency_contact_name
      ELSE NULL
    END as emergency_contact_name,
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.emergency_contact_phone
      ELSE NULL
    END as emergency_contact_phone,
    CASE 
      WHEN is_hr_admin OR cu.auth_user_id = auth.uid() THEN cu.emergency_contact_relationship
      ELSE NULL
    END as emergency_contact_relationship,
    cu.city,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = query_user_id
    AND cu.status = 'Active'
  LIMIT 1;
END;
$$;