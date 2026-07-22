-- Fix search path for existing functions to resolve security warnings
CREATE OR REPLACE FUNCTION public.calculate_working_days(start_date date, end_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_remaining_leave_days(user_uuid uuid, leave_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS TABLE(annual_leave_remaining numeric, sick_leave_remaining numeric, personal_days_remaining numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  SELECT CASE 
    WHEN public.get_current_user_role() IN ('Super-Admin', 'Admin', 'Supervisor') THEN true
    ELSE false
  END
$function$;

CREATE OR REPLACE FUNCTION public.get_user_name(user_uuid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  SELECT name FROM public.profiles WHERE user_id = user_uuid
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, status)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email), 
    'Operator',
    'Active'
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_system_user_name(user_uuid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  SELECT name FROM public.system_users WHERE id = user_uuid
$function$;

CREATE OR REPLACE FUNCTION public.get_assignable_users()
 RETURNS TABLE(id uuid, name text, role text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  SELECT system_users.id, system_users.name, system_users.role, system_users.status 
  FROM public.system_users 
  WHERE system_users.status = 'Active'
  ORDER BY system_users.name
$function$;