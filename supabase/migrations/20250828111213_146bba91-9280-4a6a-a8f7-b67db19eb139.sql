-- Fix remaining staff functions to use correct data_type values

-- Update get_staff_contact_info_secure to use normalized data_type
CREATE OR REPLACE FUNCTION public.get_staff_contact_info_secure(target_user_id uuid, access_reason text DEFAULT NULL)
RETURNS TABLE(
    user_id uuid,
    phone_number text,
    email text,
    city text,
    country text
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
    
    -- Only HR, Admin, and Super-Admin can access contact info
    IF accessor_role NOT IN ('HR', 'Admin', 'Super-Admin') THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to access contact information';
    END IF;
    
    -- Log the access with normalized data_type
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        fields_accessed
    ) VALUES (
        auth.uid(),
        target_user_id,
        'CONTACT_INFO', -- Use normalized format
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

-- Update get_staff_emergency_contacts_secure to use normalized data_type
CREATE OR REPLACE FUNCTION public.get_staff_emergency_contacts_secure(target_user_id uuid, access_reason text)
RETURNS TABLE(
    user_id uuid,
    emergency_contact_name text,
    emergency_contact_phone text,
    emergency_contact_relationship text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    
    -- Log the access with normalized data_type
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        fields_accessed
    ) VALUES (
        auth.uid(),
        target_user_id,
        'EMERGENCY_CONTACTS', -- Use normalized format
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