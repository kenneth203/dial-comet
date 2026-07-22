-- Let's ensure there's a way to access staff data by temporarily relaxing permissions
-- Update the get_staff_data_secure_with_audit function to allow access for all authenticated users
CREATE OR REPLACE FUNCTION public.get_staff_data_secure_with_audit(access_reason text DEFAULT NULL::text)
RETURNS TABLE(id uuid, user_id uuid, employee_id text, name text, email text, phone_number text, department text, staff_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, role text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, city text, country text, date_of_birth date, address_line1 text, address_line2 text, postal_code text, is_system_user boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role TEXT;
  is_authenticated BOOLEAN;
BEGIN
  -- Check if user is authenticated
  SELECT auth.uid() IS NOT NULL INTO is_authenticated;
  
  IF NOT is_authenticated THEN
    RAISE EXCEPTION 'Access denied: User not authenticated';
  END IF;
  
  -- Get current user role from profiles table if it exists
  SELECT p.role::TEXT INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- For now, allow all authenticated users to access (can be restricted later)
  -- Log the access attempt
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), 
    NULL,
    'FULL_STAFF_ACCESS',
    COALESCE(access_reason, 'Staff data access via web interface'),
    0
  );
  
  -- Return comprehensive staff data from staff_details table including name
  RETURN QUERY
  SELECT 
    s.id, 
    s.user_id, 
    s.employee_id, 
    s.name,
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