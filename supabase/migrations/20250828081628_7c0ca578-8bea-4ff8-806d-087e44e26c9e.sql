-- Drop and recreate functions with correct signatures

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.get_my_basic_profile_data();
DROP FUNCTION IF EXISTS public.get_employee_basic_data_secure(uuid);

-- Function for getting basic profile data for current user
CREATE OR REPLACE FUNCTION public.get_my_basic_profile_data()
RETURNS TABLE(id uuid, auth_user_id uuid, name text, email text, phone_number text, role text, status text, employee_id text, department text, job_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, city text, country text, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, is_system_user boolean, is_staff_member boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Return current user's basic profile data from comprehensive_users
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
    WHERE cu.auth_user_id = auth.uid()
    LIMIT 1;
END;
$function$;

-- Recreate get_employee_basic_data_secure function
CREATE OR REPLACE FUNCTION public.get_employee_basic_data_secure(target_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, auth_user_id uuid, name text, email text, phone_number text, role text, status text, employee_id text, department text, job_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, city text, country text, is_system_user boolean, is_staff_member boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    accessor_role TEXT;
    is_admin_access BOOLEAN := FALSE;
    query_user_id UUID;
BEGIN
    -- Get current user role
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.status = 'Active';
    
    -- Determine if this is admin access
    IF accessor_role IN ('Super-Admin', 'HR', 'Admin') THEN
        is_admin_access := TRUE;
    END IF;
    
    -- Set target user (self if not specified or not authorized)
    IF is_admin_access AND target_user_id IS NOT NULL THEN
        query_user_id := target_user_id;
    ELSIF is_admin_access AND target_user_id IS NULL THEN
        -- Admin requesting all users
        query_user_id := NULL;
    ELSE
        query_user_id := auth.uid(); -- Force to own record for non-admins
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
            WHEN is_admin_access OR cu.auth_user_id = auth.uid() THEN cu.email
            ELSE mask_email(cu.email)
        END as email,
        CASE 
            WHEN is_admin_access OR cu.auth_user_id = auth.uid() THEN cu.phone_number
            ELSE mask_phone_number(cu.phone_number)
        END as phone_number,
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
        cu.is_system_user,
        cu.is_staff_member,
        cu.created_at,
        cu.updated_at
    FROM public.comprehensive_users cu
    WHERE 
        (is_admin_access AND (target_user_id IS NULL OR cu.auth_user_id = target_user_id))
        OR (NOT is_admin_access AND cu.auth_user_id = auth.uid());
END;
$function$;