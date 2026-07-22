-- Drop and recreate functions with correct signatures

-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_my_basic_profile_data();

-- Recreate the function with the correct signature
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