-- Ensure the current user has proper permissions for staff management

-- 1. Create a function to ensure user profile exists and has the right permissions
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_user_id uuid;
    existing_profile profiles%ROWTYPE;
    staff_record staff_details%ROWTYPE;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if profile exists
    SELECT * INTO existing_profile
    FROM public.profiles 
    WHERE user_id = current_user_id;
    
    IF existing_profile.id IS NULL THEN
        -- Check if user has a staff record to determine their role
        SELECT * INTO staff_record
        FROM public.staff_details
        WHERE user_id = current_user_id;
        
        -- Create profile based on staff record or default
        INSERT INTO public.profiles (user_id, name, role, status)
        VALUES (
            current_user_id,
            COALESCE(staff_record.employee_id, 'User'),
            CASE 
                WHEN staff_record.role IN ('Owner', 'Manager', 'Admin') THEN 'Admin'
                WHEN staff_record.role = 'Supervisor' THEN 'Supervisor' 
                ELSE 'Operator'
            END::user_role,
            'Active'::user_status
        );
        
        RETURN TRUE;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- 2. Update the staff update function to handle missing profiles better
CREATE OR REPLACE FUNCTION public.update_staff_data_secure(
    staff_id uuid,
    access_reason text DEFAULT 'Staff data update via secure function',
    new_email text DEFAULT NULL,
    new_phone_number text DEFAULT NULL,
    new_department text DEFAULT NULL,
    new_position text DEFAULT NULL,
    new_contract_type text DEFAULT NULL,
    new_working_hours_per_week numeric DEFAULT NULL,
    new_date_of_birth date DEFAULT NULL,
    new_start_date date DEFAULT NULL,
    new_annual_leave_entitlement numeric DEFAULT NULL,
    new_emergency_contact_name text DEFAULT NULL,
    new_emergency_contact_phone text DEFAULT NULL,
    new_emergency_contact_relationship text DEFAULT NULL,
    new_address_line1 text DEFAULT NULL,
    new_address_line2 text DEFAULT NULL,
    new_city text DEFAULT NULL,
    new_postal_code text DEFAULT NULL,
    new_country text DEFAULT NULL,
    new_role text DEFAULT NULL,
    new_status text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    target_user_id uuid;
    current_user_id uuid;
    update_allowed BOOLEAN := FALSE;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Ensure user has a profile
    PERFORM ensure_user_profile();
    
    -- Get current user role
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = current_user_id;
    
    -- Get the target staff record
    SELECT s.user_id INTO target_user_id
    FROM public.staff_details s
    WHERE s.id = staff_id;
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Staff record not found with ID: %', staff_id;
    END IF;
    
    -- Determine if update is allowed
    IF accessor_role IN ('HR', 'Super-Admin', 'Admin') THEN
        update_allowed := TRUE;
    ELSIF current_user_id = target_user_id THEN
        -- User updating their own record
        update_allowed := TRUE;
        accessor_role := 'SELF_UPDATE';
    ELSE
        RAISE EXCEPTION 'Access denied: Insufficient privileges to update staff data. User role: % attempting to update staff ID: %', 
            COALESCE(accessor_role, 'NULL'), staff_id;
    END IF;
    
    -- Log the access
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        current_user_id,
        target_user_id,
        'INDIVIDUAL_STAFF_ACCESS',
        access_reason,
        CASE WHEN accessor_role = 'SELF_UPDATE' THEN 5 ELSE 0 END
    );
    
    -- Perform the update
    UPDATE public.staff_details 
    SET 
        email = COALESCE(new_email, email),
        phone_number = COALESCE(new_phone_number, phone_number),
        department = COALESCE(new_department, department),
        "position" = COALESCE(new_position, "position"),
        contract_type = COALESCE(new_contract_type, contract_type),
        working_hours_per_week = COALESCE(new_working_hours_per_week, working_hours_per_week),
        date_of_birth = COALESCE(new_date_of_birth, date_of_birth),
        start_date = COALESCE(new_start_date, start_date),
        annual_leave_entitlement = COALESCE(new_annual_leave_entitlement, annual_leave_entitlement),
        emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
        emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
        emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
        address_line1 = COALESCE(new_address_line1, address_line1),
        address_line2 = COALESCE(new_address_line2, address_line2),
        city = COALESCE(new_city, city),
        postal_code = COALESCE(new_postal_code, postal_code),
        country = COALESCE(new_country, country),
        role = COALESCE(new_role, role),
        status = COALESCE(new_status, status),
        updated_at = now()
    WHERE id = staff_id;
    
    -- Verify the update occurred
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Update failed - no rows affected for staff ID: %', staff_id;
    END IF;
    
    RETURN TRUE;
END;
$$;