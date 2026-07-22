-- Fix date handling in the staff creation function to handle null values properly

CREATE OR REPLACE FUNCTION public.create_staff_member_secure(
    staff_data jsonb,
    create_system_user boolean DEFAULT false,
    auth_email text DEFAULT NULL,
    auth_password text DEFAULT NULL
)
RETURNS TABLE(staff_id uuid, created_auth_user boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_user_id uuid;
    new_auth_user_id uuid := NULL;
    new_staff_id uuid;
    accessor_role TEXT;
    created_user boolean := false;
    parsed_start_date date := NULL;
    parsed_dob date := NULL;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Ensure user has proper profile and permissions
    PERFORM ensure_user_profile();
    
    -- Check permissions
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = current_user_id;
    
    IF accessor_role NOT IN ('HR', 'Super-Admin', 'Admin') THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to create staff members';
    END IF;
    
    -- If creating a system user, we need auth credentials
    IF create_system_user THEN
        IF auth_email IS NULL OR auth_password IS NULL THEN
            RAISE EXCEPTION 'Email and password required when creating system user';
        END IF;
        
        -- Note: Auth user creation will need to be handled in the application
        -- For now, we'll create a placeholder and the app will handle auth creation
        new_auth_user_id := gen_random_uuid();
        created_user := true;
    ELSE
        -- For staff-only records, create a unique placeholder user_id
        new_auth_user_id := gen_random_uuid();
    END IF;
    
    -- Parse date fields safely
    BEGIN
        IF staff_data->>'start_date' IS NOT NULL AND staff_data->>'start_date' != '' THEN
            parsed_start_date := (staff_data->>'start_date')::date;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            parsed_start_date := NULL;
    END;
    
    BEGIN
        IF staff_data->>'date_of_birth' IS NOT NULL AND staff_data->>'date_of_birth' != '' THEN
            parsed_dob := (staff_data->>'date_of_birth')::date;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            parsed_dob := NULL;
    END;
    
    -- Log the access
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        current_user_id,
        new_auth_user_id,
        'INDIVIDUAL_STAFF_ACCESS',
        'Creating new staff member via secure function',
        0
    );
    
    -- Insert the staff record with proper null handling
    INSERT INTO public.staff_details (
        user_id,
        employee_id,
        email,
        phone_number,
        department,
        "position",
        contract_type,
        working_hours_per_week,
        start_date,
        annual_leave_entitlement,
        role,
        status,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        address_line1,
        address_line2,
        city,
        postal_code,
        country,
        date_of_birth,
        is_system_user
    ) VALUES (
        new_auth_user_id,
        NULLIF(COALESCE(staff_data->>'employee_id', ''), ''),
        NULLIF(COALESCE(staff_data->>'email', ''), ''),
        NULLIF(staff_data->>'phone_number', ''),
        NULLIF(staff_data->>'department', ''),
        NULLIF(staff_data->>'position', ''),
        COALESCE(NULLIF(staff_data->>'contract_type', ''), 'full_time'),
        COALESCE((NULLIF(staff_data->>'working_hours_per_week', ''))::numeric, 37.5),
        parsed_start_date,
        COALESCE((NULLIF(staff_data->>'annual_leave_entitlement', ''))::numeric, 25.0),
        COALESCE(NULLIF(staff_data->>'role', ''), 'Operator'),
        COALESCE(NULLIF(staff_data->>'status', ''), 'Active'),
        NULLIF(staff_data->>'emergency_contact_name', ''),
        NULLIF(staff_data->>'emergency_contact_phone', ''),
        NULLIF(staff_data->>'emergency_contact_relationship', ''),
        NULLIF(staff_data->>'address_line1', ''),
        NULLIF(staff_data->>'address_line2', ''),
        NULLIF(staff_data->>'city', ''),
        NULLIF(staff_data->>'postal_code', ''),
        COALESCE(NULLIF(staff_data->>'country', ''), 'United Kingdom'),
        parsed_dob,
        create_system_user
    )
    RETURNING id INTO new_staff_id;
    
    RETURN QUERY SELECT new_staff_id, created_user;
END;
$$;