-- Create a simpler staff directory function that doesn't require admin access
CREATE OR REPLACE FUNCTION public.get_staff_directory_public()
RETURNS TABLE(id uuid, user_id uuid, employee_id text, name text, email text, phone_number text, department text, staff_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, role text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, city text, country text, date_of_birth date, address_line1 text, address_line2 text, postal_code text, is_system_user boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Return staff data - accessible to all authenticated users for basic directory needs
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

-- Also create a function to check if user can access comprehensive staff management
CREATE OR REPLACE FUNCTION public.can_access_comprehensive_staff_data()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Super-Admin', 'Admin')
    AND status = 'Active'
  );
$$;