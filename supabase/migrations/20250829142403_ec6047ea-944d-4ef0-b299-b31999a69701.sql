-- Fix holiday entitlements to work with system user IDs instead of auth user IDs
-- Drop the existing function that relies on auth user IDs
DROP FUNCTION IF EXISTS public.get_system_user_remaining_days(uuid, integer);

-- Create new function that works directly with system user IDs
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_data(system_user_id uuid, leave_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS TABLE(
  annual_leave_remaining numeric,
  sick_leave_remaining numeric, 
  personal_days_remaining numeric,
  public_holidays_remaining numeric,
  total_days_allowed numeric,
  total_days_used numeric,
  total_days_remaining numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH user_entitlements AS (
    SELECT 
      COALESCE(su.annual_leave_days, 25.0) as annual_entitlement,
      COALESCE(su.sick_leave_days, 10.0) as sick_entitlement,
      COALESCE(su.personal_days, 5.0) as personal_entitlement,
      COALESCE(su.public_holidays, 8.0) as public_entitlement,
      COALESCE(su.carried_over_days, 0.0) as carried_over,
      su.user_id as auth_user_id
    FROM public.system_users su
    WHERE su.id = system_user_id
  ),
  used_days AS (
    SELECT 
      COALESCE(SUM(CASE WHEN absence_type = 'annual_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_annual,
      COALESCE(SUM(CASE WHEN absence_type = 'sick_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_sick,
      COALESCE(SUM(CASE WHEN absence_type IN ('compassionate_leave', 'study_leave') AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_personal,
      COALESCE(SUM(CASE WHEN absence_type = 'public_holiday' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_public
    FROM public.holiday_requests hr
    JOIN user_entitlements ue ON hr.user_id = ue.auth_user_id
    WHERE EXTRACT(YEAR FROM hr.start_date) = leave_year
  )
  SELECT 
    COALESCE(ue.annual_entitlement + ue.carried_over, 25.0) - COALESCE(ud.used_annual, 0) as annual_leave_remaining,
    COALESCE(ue.sick_entitlement, 10.0) - COALESCE(ud.used_sick, 0) as sick_leave_remaining,
    COALESCE(ue.personal_entitlement, 5.0) - COALESCE(ud.used_personal, 0) as personal_days_remaining,
    COALESCE(ue.public_entitlement, 8.0) - COALESCE(ud.used_public, 0) as public_holidays_remaining,
    COALESCE(ue.annual_entitlement + ue.carried_over + ue.sick_entitlement + ue.personal_entitlement + ue.public_entitlement, 48.0) as total_days_allowed,
    COALESCE(ud.used_annual + ud.used_sick + ud.used_personal + ud.used_public, 0) as total_days_used,
    COALESCE(ue.annual_entitlement + ue.carried_over + ue.sick_entitlement + ue.personal_entitlement + ue.public_entitlement, 48.0) - COALESCE(ud.used_annual + ud.used_sick + ud.used_personal + ud.used_public, 0) as total_days_remaining
  FROM user_entitlements ue
  CROSS JOIN used_days ud;
$function$;

-- Create function to initialize default holiday entitlements for new system users
CREATE OR REPLACE FUNCTION public.initialize_system_user_holidays()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set default holiday entitlements for new system users if not provided
  NEW.annual_leave_days := COALESCE(NEW.annual_leave_days, 25.0);
  NEW.sick_leave_days := COALESCE(NEW.sick_leave_days, 10.0);
  NEW.personal_days := COALESCE(NEW.personal_days, 5.0);
  NEW.public_holidays := COALESCE(NEW.public_holidays, 8.0);
  NEW.carried_over_days := COALESCE(NEW.carried_over_days, 0.0);
  NEW.holiday_year := COALESCE(NEW.holiday_year, EXTRACT(YEAR FROM NOW())::integer);
  
  RETURN NEW;
END;
$function$;

-- Add trigger to initialize holiday entitlements for new system users
DROP TRIGGER IF EXISTS system_users_initialize_holidays ON public.system_users;
CREATE TRIGGER system_users_initialize_holidays
  BEFORE INSERT ON public.system_users
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_system_user_holidays();