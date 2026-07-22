-- Fix the get_staff_basic_info_secure function that's causing the ambiguous role error

-- Check if this function exists and drop it if it does
DROP FUNCTION IF EXISTS public.get_staff_basic_info_secure();

-- Create a corrected version
CREATE OR REPLACE FUNCTION public.get_staff_basic_info_secure()
RETURNS TABLE(id uuid, user_id uuid, employee_id text, name text, email text, phone_number text, department text, staff_position text, role text, status text, is_system_user boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
BEGIN
  -- Get current user role from profiles table, explicitly qualifying the table
  SELECT p.role::TEXT INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Log directory access
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), NULL, 'BASIC_STAFF_INFO_ACCESS', 'Basic staff info lookup', 0
  );
  
  -- Return basic staff information from staff_details table
  RETURN QUERY
  SELECT 
    s.id, 
    s.user_id, 
    s.employee_id,
    COALESCE(p.name, 'Unknown') as name,
    s.email, 
    s.phone_number, 
    s.department, 
    s."position" as staff_position, 
    s.role,  -- This is from staff_details table
    s.status, 
    s.is_system_user,
    s.created_at,
    s.updated_at
  FROM public.staff_details s
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  WHERE s.status = 'Active'
  ORDER BY COALESCE(p.name, 'Unknown');
END;
$function$;

-- Also fix any other functions that might have similar issues
-- Let's recreate get_employee_basic_info_secure to make sure it's working correctly
CREATE OR REPLACE FUNCTION public.get_employee_basic_info_secure(target_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, auth_user_id uuid, name text, email text, phone_number text, role text, status text, employee_id text, department text, job_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, city text, country text, is_system_user boolean, is_staff_member boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    accessor_role TEXT;
    query_user_id UUID;
BEGIN
    -- Get current user role from profiles table with explicit qualification
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.status = 'Active';
    
    -- Set target user (self if not specified or not authorized for admin access)
    IF accessor_role IN ('HR', 'Super-Admin') AND target_user_id IS NOT NULL THEN
        query_user_id := target_user_id;
    ELSIF accessor_role IN ('HR', 'Super-Admin') AND target_user_id IS NULL THEN
        -- Admin requesting all users
        query_user_id := NULL;
    ELSE
        query_user_id := auth.uid(); -- Force to own record
    END IF;
    
    -- Log access attempt for audit trail
    INSERT INTO public.sensitive_data_access_log (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason
    ) VALUES (
        auth.uid(),
        COALESCE(query_user_id, auth.uid()),
        'basic_employee_info',
        CASE 
            WHEN query_user_id = auth.uid() THEN 'Self-access'
            WHEN query_user_id IS NULL THEN 'Admin bulk access to employee basic info'
            ELSE 'Admin access to employee basic info'
        END
    );
    
    -- Return filtered basic information
    RETURN QUERY
    SELECT 
        cu.id,
        cu.auth_user_id,
        cu.name,
        CASE 
            WHEN accessor_role IN ('HR', 'Super-Admin') OR cu.auth_user_id = auth.uid() THEN cu.email
            ELSE mask_email(cu.email)
        END as email,
        CASE 
            WHEN accessor_role IN ('HR', 'Super-Admin') OR cu.auth_user_id = auth.uid() THEN cu.phone_number
            ELSE mask_phone_number(cu.phone_number)
        END as phone_number,
        cu.role,  -- This is from comprehensive_users table
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
        cu.is_system_user,
        cu.is_staff_member,
        cu.created_at,
        cu.updated_at
    FROM public.comprehensive_users cu
    WHERE 
        (accessor_role IN ('HR', 'Super-Admin') AND (target_user_id IS NULL OR cu.auth_user_id = target_user_id))
        OR (accessor_role NOT IN ('HR', 'Super-Admin') AND cu.auth_user_id = auth.uid());
END;
$function$;