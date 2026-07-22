-- Comprehensive fix for staff creation issues
-- 1. Make user_id column nullable to allow staff-only records
-- 2. Update the function to handle this properly
-- 3. Ensure proper data validation

-- Make user_id nullable for staff-only records
ALTER TABLE public.staff_details ALTER COLUMN user_id DROP NOT NULL;

-- Create or update the function to ensure it works correctly
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
    
    -- Check permissions
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = current_user_id;
    
    IF accessor_role NOT IN ('HR', 'Super-Admin', 'Admin') THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to create staff members';
    END IF;
    
    -- Only set user_id if creating a system user
    IF create_system_user THEN
        IF auth_email IS NULL OR auth_password IS NULL THEN
            RAISE EXCEPTION 'Email and password required when creating system user';
        END IF;
        
        -- Generate placeholder user ID for system users (real ID will be updated later)
        new_auth_user_id := gen_random_uuid();
        created_user := true;
    ELSE
        -- For staff-only records, user_id remains NULL
        new_auth_user_id := NULL;
    END IF;
    
    -- Parse date fields safely - handle empty strings and invalid dates
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
    
    -- Log the access (only if we have a user_id to log)
    IF new_auth_user_id IS NOT NULL THEN
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
    ELSE
        -- Log staff-only record creation
        INSERT INTO public.staff_data_access_audit (
            accessed_by,
            employee_user_id,
            data_type,
            access_reason,
            risk_score
        ) VALUES (
            current_user_id,
            NULL, -- NULL is now allowed in employee_user_id
            'STAFF_ONLY_RECORD_CREATION',
            'Creating staff-only record (no system user)',
            0
        );
    END IF;
    
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
        new_auth_user_id, -- This can now be NULL for staff-only records
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

-- Ensure the staff data access audit table can handle NULL employee_user_id
ALTER TABLE public.staff_data_access_audit ALTER COLUMN employee_user_id DROP NOT NULL;