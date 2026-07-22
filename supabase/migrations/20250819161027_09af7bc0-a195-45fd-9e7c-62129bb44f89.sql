-- Fix remaining functions without proper search_path settings

CREATE OR REPLACE FUNCTION public.get_my_basic_profile_secure()
RETURNS TABLE(id uuid, auth_user_id uuid, name text, email text, phone_number text, role text, status text, employee_id text, department text, job_position text, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, city text, country text, is_system_user boolean, is_staff_member boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.city,
    cu.country,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_basic_staff_info()
RETURNS TABLE(id uuid, user_id uuid, employee_id text, email text, phone_number text, department text, staff_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, role text, status text, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, city text, country text, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    s.id,
    s.user_id,
    s.employee_id,
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
    s.emergency_contact_name,
    s.emergency_contact_phone,
    s.emergency_contact_relationship,
    s.city,
    s.country,
    s.created_at,
    s.updated_at
  FROM public.staff_details s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_basic_staff_profile()
RETURNS TABLE(id uuid, employee_id text, email text, phone_number text, department text, staff_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, role text, status text, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, address_line1 text, city text, country text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    s.id,
    s.employee_id,
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
    s.emergency_contact_name,
    s.emergency_contact_phone,
    s.emergency_contact_relationship,
    s.address_line1,
    s.city,
    s.country
  FROM public.staff_details s
  WHERE s.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_remaining_leave_days(user_uuid uuid, leave_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS TABLE(annual_leave_remaining numeric, sick_leave_remaining numeric, personal_days_remaining numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH entitlements AS (
    SELECT 
      COALESCE(annual_leave_days, 25.0) + COALESCE(carried_over_days, 0.0) as total_annual,
      COALESCE(sick_leave_days, 10.0) as total_sick,
      COALESCE(personal_days, 5.0) as total_personal
    FROM public.holiday_entitlements 
    WHERE user_id = user_uuid AND year = leave_year
  ),
  used_days AS (
    SELECT 
      COALESCE(SUM(CASE WHEN absence_type = 'annual_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_annual,
      COALESCE(SUM(CASE WHEN absence_type = 'sick_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_sick,
      COALESCE(SUM(CASE WHEN absence_type IN ('compassionate_leave', 'study_leave') AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_personal
    FROM public.holiday_requests 
    WHERE user_id = user_uuid 
      AND EXTRACT(YEAR FROM start_date) = leave_year
  )
  SELECT 
    COALESCE(e.total_annual, 25.0) - COALESCE(u.used_annual, 0) as annual_leave_remaining,
    COALESCE(e.total_sick, 10.0) - COALESCE(u.used_sick, 0) as sick_leave_remaining,
    COALESCE(e.total_personal, 5.0) - COALESCE(u.used_personal, 0) as personal_days_remaining
  FROM entitlements e
  CROSS JOIN used_days u;
$$;

CREATE OR REPLACE FUNCTION public.get_basic_user_profile()
RETURNS TABLE(id uuid, auth_user_id uuid, name text, email text, phone_number text, role text, status text, employee_id text, department text, job_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, city text, country text, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, is_system_user boolean, is_staff_member boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.city,
    cu.country,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_all_basic_user_profiles()
RETURNS TABLE(id uuid, auth_user_id uuid, name text, email text, phone_number text, role text, status text, employee_id text, department text, job_position text, contract_type text, working_hours_per_week numeric, start_date date, annual_leave_entitlement numeric, city text, country text, emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text, is_system_user boolean, is_staff_member boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    cu.email,
    cu.phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.contract_type,
    cu.working_hours_per_week,
    cu.start_date,
    cu.annual_leave_entitlement,
    cu.city,
    cu.country,
    cu.emergency_contact_name,
    cu.emergency_contact_phone,
    cu.emergency_contact_relationship,
    cu.is_system_user,
    cu.is_staff_member,
    cu.created_at,
    cu.updated_at
  FROM public.comprehensive_users cu
  WHERE is_admin_or_higher() OR cu.auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_holiday_requests()
RETURNS TABLE(id uuid, start_date date, end_date date, total_days numeric, absence_type absence_type, status request_status, reason text, decline_reason text, created_at timestamp with time zone, updated_at timestamp with time zone, approved_by uuid, approved_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    hr.id,
    hr.start_date,
    hr.end_date,
    hr.total_days,
    hr.absence_type,
    hr.status,
    hr.reason,
    hr.decline_reason,
    hr.created_at,
    hr.updated_at,
    hr.approved_by,
    hr.approved_at
  FROM public.holiday_requests hr
  WHERE hr.user_id = auth.uid()
  ORDER BY hr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_all_holiday_requests_admin()
RETURNS TABLE(id uuid, user_id uuid, user_name text, start_date date, end_date date, total_days numeric, absence_type absence_type, status request_status, reason text, decline_reason text, created_at timestamp with time zone, updated_at timestamp with time zone, approved_by uuid, approved_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    hr.id,
    hr.user_id,
    p.name as user_name,
    hr.start_date,
    hr.end_date,
    hr.total_days,
    hr.absence_type,
    hr.status,
    hr.reason,
    hr.decline_reason,
    hr.created_at,
    hr.updated_at,
    hr.approved_by,
    hr.approved_at
  FROM public.holiday_requests hr
  LEFT JOIN public.profiles p ON p.user_id = hr.user_id
  WHERE is_admin_or_higher()
  ORDER BY hr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.calculate_working_days(start_date date, end_date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  working_days DECIMAL(4,1) := 0;
  check_date DATE := start_date;
BEGIN
  WHILE check_date <= end_date LOOP
    -- Check if it's not a weekend (Saturday = 6, Sunday = 0)
    IF EXTRACT(DOW FROM check_date) NOT IN (0, 6) THEN
      working_days := working_days + 1;
    END IF;
    check_date := check_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN working_days;
END;
$$;