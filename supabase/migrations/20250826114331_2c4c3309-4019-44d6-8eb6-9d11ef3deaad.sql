-- Fix security issue: Restrict staff personal data access to HR only
-- The current get_secure_staff_data() function allows Admin and Supervisor roles 
-- to access all staff personal details, which violates privacy principles.

-- Update the function to only allow HR and Super-Admin to see sensitive personal data
CREATE OR REPLACE FUNCTION public.get_secure_staff_data()
RETURNS TABLE(
  id uuid, user_id uuid, employee_id text, email text, phone_number text, 
  department text, staff_position text, contract_type text, 
  working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, 
  role text, status text, created_at timestamp with time zone, 
  updated_at timestamp with time zone, emergency_contact_name text, 
  emergency_contact_phone text, emergency_contact_relationship text, 
  city text, country text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
  is_hr_or_super_admin BOOLEAN;
BEGIN
  -- Get current user role
  SELECT role::TEXT INTO user_role
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Check if user has HR or Super-Admin privileges
  SELECT user_role IN ('HR', 'Super-Admin') INTO is_hr_or_super_admin;
  
  -- Return data based on access level
  IF is_hr_or_super_admin THEN
    -- HR and Super-Admin get all records with all fields (including sensitive data)
    RETURN QUERY
    SELECT 
      s.id, s.user_id, s.employee_id, s.email, s.phone_number,
      s.department, s."position" as staff_position, s.contract_type,
      s.working_hours_per_week, s.start_date, s.annual_leave_entitlement,
      s.role, s.status, s.created_at, s.updated_at,
      s.emergency_contact_name, s.emergency_contact_phone, s.emergency_contact_relationship,
      s.city, s.country
    FROM public.staff_details s;
  ELSE
    -- All other users (including Admin/Supervisor) get only their own record OR
    -- basic non-sensitive information for all staff (name, department, position, status only)
    IF user_role IN ('Admin', 'Supervisor') THEN
      -- Admin/Supervisor can see basic directory information but NOT personal contact details
      RETURN QUERY
      SELECT 
        s.id, s.user_id, s.employee_id, 
        NULL::text as email,  -- Hide personal email
        NULL::text as phone_number,  -- Hide personal phone
        s.department, s."position" as staff_position, s.contract_type,
        s.working_hours_per_week, s.start_date, s.annual_leave_entitlement,
        s.role, s.status, s.created_at, s.updated_at,
        NULL::text as emergency_contact_name,  -- Hide emergency contacts
        NULL::text as emergency_contact_phone,
        NULL::text as emergency_contact_relationship,
        NULL::text as city,  -- Hide address information
        s.country  -- Only show country (less sensitive)
      FROM public.staff_details s;
    ELSE
      -- Regular users get only their own record with all their personal fields
      RETURN QUERY
      SELECT 
        s.id, s.user_id, s.employee_id, s.email, s.phone_number,
        s.department, s."position" as staff_position, s.contract_type,
        s.working_hours_per_week, s.start_date, s.annual_leave_entitlement,
        s.role, s.status, s.created_at, s.updated_at,
        s.emergency_contact_name, s.emergency_contact_phone, s.emergency_contact_relationship,
        s.city, s.country
      FROM public.staff_details s
      WHERE s.user_id = auth.uid();
    END IF;
  END IF;
END;
$function$;

-- Add audit logging for staff data access
CREATE OR REPLACE FUNCTION public.log_staff_directory_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  accessor_role TEXT;
BEGIN
  -- Get current user role
  SELECT role::TEXT INTO accessor_role
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Log access to staff directory (but not self-access)
  IF auth.uid() != NEW.user_id THEN
    INSERT INTO public.staff_data_access_audit (
      accessed_by, employee_user_id, data_type, access_reason, risk_score
    ) VALUES (
      auth.uid(), NEW.user_id, 'staff_directory_access', 
      'Directory lookup by ' || COALESCE(accessor_role, 'unknown'), 0
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Add comprehensive audit logging for enhanced security monitoring
COMMENT ON FUNCTION public.get_secure_staff_data() IS 'Secure staff data access with role-based filtering. Only HR and Super-Admin can access sensitive personal information. Admin/Supervisor users get basic directory information only.';
COMMENT ON FUNCTION public.log_staff_directory_access() IS 'Audit logging for staff directory access to track who views staff information.';