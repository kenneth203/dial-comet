-- Add name column to staff_details table
ALTER TABLE public.staff_details 
ADD COLUMN name text;

-- Update the create_staff_member_secure function to handle the name field
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
    
    -- Log the access using existing valid data type
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        current_user_id,
        new_auth_user_id, -- Can be NULL for staff-only records
        'INDIVIDUAL_STAFF_ACCESS', -- Use existing valid data type
        CASE 
            WHEN create_system_user THEN 'Creating new staff member with system user via secure function'
            ELSE 'Creating staff-only record (no system user) via secure function'
        END,
        0
    );
    
    -- Insert the staff record with proper null handling and the new name field
    INSERT INTO public.staff_details (
        user_id,
        name,
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
        new_auth_user_id, -- This can be NULL for staff-only records
        NULLIF(staff_data->>'name', ''), -- Add the name field
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

-- Update the get_staff_data_secure_with_audit function to include the name field
CREATE OR REPLACE FUNCTION public.get_staff_data_secure_with_audit(access_reason text DEFAULT NULL::text)
RETURNS TABLE(id uuid, user_id uuid, employee_id text, name text, email text, phone_number text, department text, staff_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, role text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, city text, country text, date_of_birth date, address_line1 text, address_line2 text, postal_code text, is_system_user boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role TEXT;
  is_hr_or_super_admin BOOLEAN;
  access_type TEXT;
BEGIN
  -- Get current user role from profiles table, explicitly qualifying the table
  SELECT p.role::TEXT INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Check if user has HR or Super-Admin privileges
  SELECT user_role IN ('HR', 'Super-Admin') INTO is_hr_or_super_admin;
  
  -- Only allow HR and Super-Admin to access this function
  IF NOT is_hr_or_super_admin THEN
    RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can access comprehensive staff data';
  END IF;
  
  -- Determine access type for logging
  access_type := 'FULL_STAFF_ACCESS';
  
  -- Log the access attempt with NULL employee_user_id for bulk access
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), 
    NULL, -- NULL for bulk access is now allowed
    access_type,
    COALESCE(access_reason, 'Bulk staff data access for administration'),
    0 -- Low risk for admin access
  );
  
  -- Return comprehensive staff data from staff_details table including name
  RETURN QUERY
  SELECT 
    s.id, 
    s.user_id, 
    s.employee_id, 
    s.name, -- Use the name field directly from staff_details
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
    s.created_at, 
    s.updated_at,
    s.emergency_contact_name, 
    s.emergency_contact_phone, 
    s.emergency_contact_relationship,
    s.city, 
    s.country, 
    s.date_of_birth, 
    s.address_line1, 
    s.address_line2, 
    s.postal_code,
    s.is_system_user
  FROM public.staff_details s
  ORDER BY s.name NULLS LAST;
END;
$$;