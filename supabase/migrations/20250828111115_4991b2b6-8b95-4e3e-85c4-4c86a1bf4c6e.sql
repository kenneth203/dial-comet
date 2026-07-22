-- Fix all staff data access issues - Part 2: Create the missing functions

-- 1. Create the missing get_staff_basic_info_secure function
CREATE OR REPLACE FUNCTION public.get_staff_basic_info_secure()
RETURNS TABLE(
    id uuid,
    user_id uuid,
    employee_id text,
    name text,
    email text,
    phone_number text,
    department text,
    staff_position text,
    contract_type text,
    working_hours_per_week numeric,
    start_date date,
    annual_leave_entitlement numeric,
    role text,
    status text,
    city text,
    country text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Log the access
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        auth.uid(),
        NULL,
        'BASIC_STAFF_INFO',
        'Basic staff directory access',
        0
    );
    
    -- Return basic staff directory (non-sensitive info only)
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
        s.contract_type,
        s.working_hours_per_week,
        s.start_date,
        s.annual_leave_entitlement,
        s.role,
        s.status,
        s.city,
        s.country,
        s.created_at,
        s.updated_at
    FROM public.staff_details s
    LEFT JOIN public.profiles p ON p.user_id = s.user_id
    WHERE s.status = 'Active'
    ORDER BY COALESCE(p.name, 'Unknown');
END;
$$;

-- 2. Recreate the log_staff_data_access function with data_type normalization
CREATE OR REPLACE FUNCTION public.log_staff_data_access(
    employee_user_id uuid,
    data_type text,
    access_reason text,
    fields_accessed text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    normalized_data_type TEXT;
BEGIN
    -- Normalize data_type to match constraint values
    normalized_data_type := CASE
        WHEN data_type IN ('contact_info', 'CONTACT_INFO') THEN 'CONTACT_INFO'
        WHEN data_type IN ('personal_details', 'PERSONAL_DETAILS') THEN 'PERSONAL_DETAILS'
        WHEN data_type IN ('emergency_contacts', 'EMERGENCY_CONTACTS') THEN 'EMERGENCY_CONTACTS'
        WHEN data_type IN ('basic_staff_info', 'BASIC_STAFF_INFO') THEN 'BASIC_STAFF_INFO'
        WHEN data_type IN ('staff_directory', 'STAFF_DIRECTORY_ACCESS') THEN 'STAFF_DIRECTORY_ACCESS'
        ELSE UPPER(data_type)
    END;
    
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        fields_accessed
    ) VALUES (
        auth.uid(),
        employee_user_id,
        normalized_data_type,
        access_reason,
        fields_accessed
    );
END;
$$;

-- 3. Recreate get_staff_personal_details_secure with fixed data_type
CREATE OR REPLACE FUNCTION public.get_staff_personal_details_secure(target_user_id uuid, access_reason text)
RETURNS TABLE(
    user_id uuid,
    date_of_birth date,
    address_line1 text,
    address_line2 text,
    postal_code text,
    full_address text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    risk_score INTEGER := 0;
    current_hour INTEGER;
BEGIN
    -- Validate access reason
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 15 THEN
        RAISE EXCEPTION 'Detailed business justification (min 15 chars) required for personal details access';
    END IF;
    
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Calculate risk score
    current_hour := EXTRACT(HOUR FROM NOW());
    IF current_hour < 7 OR current_hour > 19 THEN
        risk_score := risk_score + 15;
    END IF;
    
    -- Enhanced access control for personal details
    IF accessor_role = 'Super-Admin' THEN
        -- Super-Admin has access
        NULL;
    ELSIF accessor_role = 'HR' AND risk_score < 20 THEN
        -- HR has limited access during business hours
        NULL;
    ELSE
        RAISE EXCEPTION 'Access denied: Only Super-Admin and HR during business hours can access personal details';
    END IF;
    
    -- Log the access with normalized data_type
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        fields_accessed,
        risk_score
    ) VALUES (
        auth.uid(),
        target_user_id,
        'PERSONAL_DETAILS', -- Now matches the constraint
        access_reason,
        ARRAY['date_of_birth', 'address_line1', 'address_line2', 'postal_code'],
        risk_score
    );
    
    RETURN QUERY
    SELECT 
        s.user_id,
        s.date_of_birth,
        s.address_line1,
        s.address_line2,
        s.postal_code,
        CASE 
            WHEN s.address_line1 IS NOT NULL THEN 
                CONCAT_WS(', ', s.address_line1, s.address_line2, s.city, s.postal_code, s.country)
            ELSE NULL
        END as full_address
    FROM public.staff_details s
    WHERE s.user_id = target_user_id;
END;
$$;