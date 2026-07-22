-- Create function to update existing staff records with names
CREATE OR REPLACE FUNCTION public.update_staff_data_secure(
    staff_id uuid,
    access_reason text,
    new_name text DEFAULT NULL,
    new_email text DEFAULT NULL,
    new_phone_number text DEFAULT NULL,
    new_department text DEFAULT NULL,
    new_position text DEFAULT NULL,
    new_salary numeric DEFAULT NULL,
    new_contract_type text DEFAULT NULL,
    new_working_hours_per_week numeric DEFAULT NULL,
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
    new_date_of_birth date DEFAULT NULL,
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
BEGIN
    -- Enhanced permission check
    SELECT p.role::TEXT INTO accessor_role 
    FROM public.profiles p
    WHERE p.user_id = auth.uid();
    
    IF accessor_role NOT IN ('Super-Admin', 'HR', 'Admin') THEN
        RAISE EXCEPTION 'Access denied: Only Super-Admin, HR, and Admin can modify staff data';
    END IF;
    
    IF access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 10 THEN
        RAISE EXCEPTION 'Detailed access reason (min 10 chars) required for staff data modifications';
    END IF;
    
    -- Log the access
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        auth.uid(),
        staff_id,
        'INDIVIDUAL_STAFF_ACCESS',
        access_reason,
        0
    );
    
    -- Update the staff record
    UPDATE public.staff_details 
    SET 
        name = COALESCE(new_name, name),
        email = COALESCE(new_email, email),
        phone_number = COALESCE(new_phone_number, phone_number),
        department = COALESCE(new_department, department),
        "position" = COALESCE(new_position, "position"),
        contract_type = COALESCE(new_contract_type, contract_type),
        working_hours_per_week = COALESCE(new_working_hours_per_week, working_hours_per_week),
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
        date_of_birth = COALESCE(new_date_of_birth, date_of_birth),
        role = COALESCE(new_role, role),
        status = COALESCE(new_status, status),
        updated_at = NOW()
    WHERE id = staff_id;
    
    RETURN TRUE;
END;
$$;

-- Update existing staff records to have proper names if they're missing
UPDATE public.staff_details 
SET name = 'Kate Campbell' 
WHERE email = 'blah@blahblah.com' AND (name IS NULL OR name = '');