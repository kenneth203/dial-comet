-- Fix ambiguous role column references in staff data functions

-- First, let's fix the get_staff_data_secure_with_audit function
CREATE OR REPLACE FUNCTION public.get_staff_data_secure_with_audit(access_reason text DEFAULT NULL::text)
RETURNS TABLE(id uuid, user_id uuid, employee_id text, name text, email text, phone_number text, department text, staff_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, role text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, city text, country text, date_of_birth date, address_line1 text, address_line2 text, postal_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  
  -- Determine access type for logging
  IF is_hr_or_super_admin THEN
    access_type := 'FULL_STAFF_ACCESS';
  ELSE
    access_type := 'OWN_RECORD_ACCESS';
  END IF;
  
  -- Log the access attempt
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), 
    CASE WHEN is_hr_or_super_admin THEN NULL ELSE auth.uid() END, -- NULL for bulk access
    access_type,
    COALESCE(access_reason, 'Context-based staff data access'),
    CASE WHEN is_hr_or_super_admin THEN 0 ELSE 5 END -- Higher risk for non-admin access
  );
  
  -- Return data based on access level
  IF is_hr_or_super_admin THEN
    -- HR and Super-Admin get all records with all fields
    RETURN QUERY
    SELECT 
      s.id, s.user_id, s.employee_id, 
      COALESCE(p.name, 'Unknown') as name,
      s.email, s.phone_number, s.department, 
      s."position" as staff_position, s.contract_type,
      s.working_hours_per_week, s.start_date, s.annual_leave_entitlement,
      s.role, s.status, s.created_at, s.updated_at,
      s.emergency_contact_name, s.emergency_contact_phone, s.emergency_contact_relationship,
      s.city, s.country, s.date_of_birth, s.address_line1, s.address_line2, s.postal_code
    FROM public.staff_details s
    LEFT JOIN public.profiles p ON p.user_id = s.user_id;
  ELSE
    -- Regular users get only their own record
    RETURN QUERY
    SELECT 
      s.id, s.user_id, s.employee_id,
      COALESCE(p.name, 'Unknown') as name,
      s.email, s.phone_number, s.department,
      s."position" as staff_position, s.contract_type,
      s.working_hours_per_week, s.start_date, s.annual_leave_entitlement,
      s.role, s.status, s.created_at, s.updated_at,
      s.emergency_contact_name, s.emergency_contact_phone, s.emergency_contact_relationship,
      s.city, s.country, s.date_of_birth, s.address_line1, s.address_line2, s.postal_code
    FROM public.staff_details s
    LEFT JOIN public.profiles p ON p.user_id = s.user_id
    WHERE s.user_id = auth.uid();
  END IF;
END;
$function$;

-- Now fix the get_staff_directory_basic function
CREATE OR REPLACE FUNCTION public.get_staff_directory_basic()
RETURNS TABLE(id uuid, user_id uuid, employee_id text, name text, department text, staff_position text, role text, status text, is_system_user boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
BEGIN
  -- Get current user role from profiles table, explicitly qualifying the table
  SELECT p.role::TEXT INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Log directory access
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), NULL, 'DIRECTORY_ACCESS', 'Basic staff directory lookup', 0
  );
  
  -- Return basic directory information only (no sensitive personal data)
  RETURN QUERY
  SELECT 
    s.id, s.user_id, s.employee_id,
    COALESCE(p.name, 'Unknown') as name,
    s.department, s."position" as staff_position, s.role, s.status, s.is_system_user
  FROM public.staff_details s
  LEFT JOIN public.profiles p ON p.user_id = s.user_id
  WHERE s.status = 'Active'  -- Only show active staff in directory
  ORDER BY COALESCE(p.name, 'Unknown');
END;
$function$;

-- Fix get_current_user_role function to avoid ambiguity
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
  SELECT p.role::TEXT 
  FROM public.profiles p 
  WHERE p.user_id = auth.uid() 
  LIMIT 1;
$function$;

-- Fix can_access_comprehensive_staff_data function
CREATE OR REPLACE FUNCTION public.can_access_comprehensive_staff_data()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role IN ('HR', 'Super-Admin')
    AND p.status = 'Active'
  );
$function$;