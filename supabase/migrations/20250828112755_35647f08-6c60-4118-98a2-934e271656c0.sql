-- Fix staff editing by ensuring proper user permissions and function security

-- 1. First, let's make sure the update function is SECURITY DEFINER and bypasses RLS
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
SECURITY DEFINER -- This is crucial - runs with function owner permissions
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    target_user_id uuid;
    current_user_id uuid;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Get current user role - be more flexible about missing profiles
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = current_user_id;
    
    -- If no profile exists, check if user is the owner of a staff record (self-edit)
    IF accessor_role IS NULL THEN
        -- Check if this is a self-update (user updating their own staff record)
        SELECT s.user_id INTO target_user_id
        FROM public.staff_details s
        WHERE s.id = staff_id AND s.user_id = current_user_id;
        
        IF target_user_id IS NOT NULL THEN
            -- Allow self-updates for basic fields only
            accessor_role := 'SELF_UPDATE';
        ELSE
            RAISE EXCEPTION 'Access denied: No profile found and not updating own record';
        END IF;
    END IF;
    
    -- Role-based access control
    IF accessor_role NOT IN ('HR', 'Super-Admin', 'Admin', 'SELF_UPDATE') THEN
        RAISE EXCEPTION 'Access denied: Insufficient privileges to update staff data. Role: %', COALESCE(accessor_role, 'NULL');
    END IF;
    
    -- Get the user_id for the staff record being updated (if not already retrieved)
    IF target_user_id IS NULL THEN
        SELECT s.user_id INTO target_user_id
        FROM public.staff_details s
        WHERE s.id = staff_id;
        
        IF target_user_id IS NULL THEN
            RAISE EXCEPTION 'Staff record not found with ID: %', staff_id;
        END IF;
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
    
    -- Update the staff record - bypasses RLS due to SECURITY DEFINER
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
    
    -- Check if update actually happened
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update staff record - record may not exist or update failed';
    END IF;
    
    RETURN TRUE;
END;
$$;

-- 2. Create a function to check current user's access level
CREATE OR REPLACE FUNCTION public.get_current_user_staff_access()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    user_role TEXT;
    user_id uuid;
BEGIN
    user_id := auth.uid();
    
    IF user_id IS NULL THEN
        RETURN 'UNAUTHENTICATED';
    END IF;
    
    -- Check profile role
    SELECT p.role::TEXT INTO user_role 
    FROM public.profiles p
    WHERE p.user_id = user_id AND p.status = 'Active';
    
    -- If no profile, check if user has staff record
    IF user_role IS NULL THEN
        IF EXISTS (SELECT 1 FROM public.staff_details WHERE user_id = auth.uid()) THEN
            RETURN 'STAFF_MEMBER';
        ELSE
            RETURN 'NO_PROFILE';
        END IF;
    END IF;
    
    RETURN user_role;
END;
$$;