-- Add holiday entitlement fields to system_users table
ALTER TABLE public.system_users 
ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC DEFAULT 25.0,
ADD COLUMN IF NOT EXISTS sick_leave_days NUMERIC DEFAULT 10.0,
ADD COLUMN IF NOT EXISTS personal_days NUMERIC DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS public_holidays NUMERIC DEFAULT 8.0,
ADD COLUMN IF NOT EXISTS carried_over_days NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS holiday_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::integer;

-- Create function to calculate remaining holiday days for system users
CREATE OR REPLACE FUNCTION public.get_system_user_remaining_days(user_uuid uuid, leave_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
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
      COALESCE(su.carried_over_days, 0.0) as carried_over
    FROM public.system_users su
    WHERE su.user_id = user_uuid
  ),
  used_days AS (
    SELECT 
      COALESCE(SUM(CASE WHEN absence_type = 'annual_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_annual,
      COALESCE(SUM(CASE WHEN absence_type = 'sick_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_sick,
      COALESCE(SUM(CASE WHEN absence_type IN ('compassionate_leave', 'study_leave') AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_personal,
      COALESCE(SUM(CASE WHEN absence_type = 'public_holiday' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_public
    FROM public.holiday_requests 
    WHERE user_id = user_uuid 
      AND EXTRACT(YEAR FROM start_date) = leave_year
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