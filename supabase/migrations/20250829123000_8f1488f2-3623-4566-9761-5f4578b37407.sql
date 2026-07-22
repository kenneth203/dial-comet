-- Drop any existing conflicting functions first
DROP FUNCTION IF EXISTS public.get_my_basic_profile_data();
DROP FUNCTION IF EXISTS public.get_employee_basic_info_secure();
DROP FUNCTION IF EXISTS public.can_access_sensitive_employee_data();
DROP FUNCTION IF EXISTS public.log_sensitive_data_access(text, text);

-- Create missing secure access functions for the frontend
-- Function for getting all employee basic data (HR/Admin only)
CREATE OR REPLACE FUNCTION public.get_employee_basic_info_secure()
RETURNS TABLE(
    id uuid, auth_user_id uuid, name text, email text, phone_number text, 
    role text, status text, employee_id text, department text, job_position text,
    contract_type text, working_hours_per_week numeric, start_date date,
    annual_leave_entitlement numeric, city text, country text,
    is_system_user boolean, is_staff_member boolean,
    created_at timestamp with time zone, updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Only HR and Super-Admin can access all employee data
    IF accessor_role NOT IN ('HR', 'Super-Admin') THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Only HR and Super-Admin can access employee data';
    END IF;
    
    -- Log the bulk access attempt
    INSERT INTO public.sensitive_data_access_log (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason
    ) VALUES (
        auth.uid(),
        auth.uid(), -- Self reference for bulk access
        'bulk_basic_employee_data',
        'HR/Admin accessing employee directory'
    );
    
    -- Return data with appropriate masking for HR (still mask some sensitive info)
    RETURN QUERY
    SELECT 
        cu.id,
        cu.auth_user_id,
        cu.name,
        mask_email(cu.email) as email, -- Still mask for audit compliance
        mask_phone_number(cu.phone_number) as phone_number,
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
    ORDER BY cu.name;
END;
$$;

-- Function to get current user's basic profile securely
CREATE OR REPLACE FUNCTION public.get_my_basic_profile_data()
RETURNS TABLE(
    id uuid, auth_user_id uuid, name text, email text, phone_number text, 
    role text, status text, employee_id text, department text, job_position text,
    emergency_contact_name text, emergency_contact_phone text, 
    emergency_contact_relationship text, created_at timestamp with time zone, 
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Log the self-access
    INSERT INTO public.sensitive_data_access_log (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason
    ) VALUES (
        auth.uid(),
        auth.uid(),
        'own_basic_profile',
        'User accessing own profile data'
    );
    
    -- Return user's own data (unmasked)
    RETURN QUERY
    SELECT 
        cu.id,
        cu.auth_user_id,
        cu.name,
        cu.email, -- Unmasked for own data
        cu.phone_number, -- Unmasked for own data
        cu.role,
        cu.status,
        cu.employee_id,
        cu.department,
        cu.job_position,
        -- Try to get emergency contacts from sensitive data if available
        COALESCE(esd.emergency_contact_name, '') as emergency_contact_name,
        COALESCE(esd.emergency_contact_phone, '') as emergency_contact_phone,
        COALESCE(esd.emergency_contact_relationship, '') as emergency_contact_relationship,
        cu.created_at,
        cu.updated_at
    FROM public.comprehensive_users cu
    LEFT JOIN public.employee_sensitive_data esd ON esd.user_id = cu.auth_user_id
    WHERE cu.auth_user_id = auth.uid()
    LIMIT 1;
END;
$$;

-- Simple logging function for data access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(employee_id text, action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.sensitive_data_access_log (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason
    ) VALUES (
        auth.uid(),
        employee_id::uuid,
        action,
        'Frontend data access logging'
    );
END;
$$;