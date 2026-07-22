-- Fix security warnings by setting search_path for all functions
-- This prevents SQL injection attacks through search_path manipulation

-- Update all the functions to have proper search_path setting
CREATE OR REPLACE FUNCTION public.log_staff_data_access(
    employee_user_id UUID,
    data_type TEXT,
    access_reason TEXT DEFAULT NULL,
    fields_accessed TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        fields_accessed
    ) VALUES (
        auth.uid(),
        employee_user_id,
        data_type,
        access_reason,
        fields_accessed
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_basic_info_secure()
RETURNS TABLE(
    id UUID,
    user_id UUID,
    employee_id TEXT,
    name TEXT,
    email TEXT,
    department TEXT,
    staff_position TEXT,
    contract_type TEXT,
    working_hours_per_week NUMERIC,
    start_date DATE,
    annual_leave_entitlement NUMERIC,
    role TEXT,
    status TEXT,
    is_system_user BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    accessor_role TEXT;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Only HR, Admin, and Super-Admin can access staff data
    IF accessor_role NOT IN ('HR', 'Admin', 'Super-Admin') THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to access staff data';
    END IF;
    
    -- Log the access (basic info is low risk)
    PERFORM log_staff_data_access(NULL, 'basic_info', 'Routine staff list access');
    
    -- Return basic, non-sensitive staff information
    RETURN QUERY
    SELECT 
        s.id,
        s.user_id,
        s.employee_id,
        p.name,
        s.email,
        s.department,
        s."position" as staff_position,
        s.contract_type,
        s.working_hours_per_week,
        s.start_date,
        s.annual_leave_entitlement,
        s.role,
        s.status,
        s.is_system_user,
        s.created_at,
        s.updated_at
    FROM public.staff_details s
    LEFT JOIN public.profiles p ON p.user_id = s.user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_contact_info_secure(
    target_user_id UUID,
    access_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID,
    phone_number TEXT,
    email TEXT,
    city TEXT,
    country TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    accessor_role TEXT;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Only HR, Admin, and Super-Admin can access contact info
    IF accessor_role NOT IN ('HR', 'Admin', 'Super-Admin') THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to access contact information';
    END IF;
    
    -- Log the access
    PERFORM log_staff_data_access(
        target_user_id, 
        'contact_info', 
        COALESCE(access_reason, 'Contact information access'),
        ARRAY['phone_number', 'email', 'city', 'country']
    );
    
    RETURN QUERY
    SELECT 
        s.user_id,
        s.phone_number,
        s.email,
        s.city,
        s.country
    FROM public.staff_details s
    WHERE s.user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_personal_details_secure(
    target_user_id UUID,
    access_reason TEXT
)
RETURNS TABLE(
    user_id UUID,
    date_of_birth DATE,
    address_line1 TEXT,
    address_line2 TEXT,
    postal_code TEXT,
    full_address TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
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
    
    -- Log the access with high detail
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
        'personal_details',
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

CREATE OR REPLACE FUNCTION public.get_staff_emergency_contacts_secure(
    target_user_id UUID,
    access_reason TEXT
)
RETURNS TABLE(
    user_id UUID,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    accessor_role TEXT;
BEGIN
    -- Validate access reason
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 10 THEN
        RAISE EXCEPTION 'Business justification (min 10 chars) required for emergency contact access';
    END IF;
    
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Only HR and Super-Admin can access emergency contacts
    IF accessor_role NOT IN ('HR', 'Super-Admin') THEN
        RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can access emergency contacts';
    END IF;
    
    -- Log the access
    PERFORM log_staff_data_access(
        target_user_id, 
        'emergency_contacts', 
        access_reason,
        ARRAY['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship']
    );
    
    RETURN QUERY
    SELECT 
        s.user_id,
        s.emergency_contact_name,
        s.emergency_contact_phone,
        s.emergency_contact_relationship
    FROM public.staff_details s
    WHERE s.user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_suspicious_staff_access()
RETURNS TABLE(
    employee_user_id UUID,
    accessor_id UUID,
    access_count BIGINT,
    high_risk_accesses BIGINT,
    data_types_accessed TEXT[]
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Only Super-Admin can run this analysis
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() AND role = 'Super-Admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin can analyze access patterns';
    END IF;
    
    RETURN QUERY
    WITH access_analysis AS (
        SELECT 
            s.employee_user_id,
            s.accessed_by,
            COUNT(*) as access_count,
            COUNT(*) FILTER (WHERE s.risk_score > 10) as high_risk_accesses,
            array_agg(DISTINCT s.data_type) as data_types_accessed
        FROM public.staff_data_access_audit s
        WHERE s.accessed_at >= NOW() - INTERVAL '30 days'
        GROUP BY s.employee_user_id, s.accessed_by
    )
    SELECT 
        a.employee_user_id,
        a.accessed_by,
        a.access_count,
        a.high_risk_accesses,
        a.data_types_accessed
    FROM access_analysis a
    WHERE 
        a.access_count > 20 OR  -- High frequency access
        a.high_risk_accesses > 5  -- Multiple high-risk accesses
    ORDER BY a.access_count DESC;
END;
$$;