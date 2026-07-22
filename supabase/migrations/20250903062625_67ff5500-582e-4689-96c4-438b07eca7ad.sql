-- Fix parameter type for get_system_user_holiday_breakdown function
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_breakdown(target_user_id text)
RETURNS TABLE(
  user_id text,
  name text,
  base_entitlement numeric,
  personal_taken numeric,
  sick_leave_remaining numeric,
  personal_allowance_available numeric,
  personal_days_remaining numeric,
  bank_holidays numeric,
  christmas_closure numeric,
  mandatory_deductions numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    su.user_id::text,
    su.name,
    COALESCE(su.annual_leave_days, 25.0) as base_entitlement,
    COALESCE(used_annual.personal_taken, 0) as personal_taken,
    COALESCE(su.sick_leave_days, 10.0) as sick_leave_remaining,
    COALESCE(su.personal_days, 5.0) as personal_allowance_available,
    GREATEST(0, COALESCE(su.personal_days, 5.0) - COALESCE(used_personal.personal_taken, 0)) as personal_days_remaining,
    COALESCE(su.public_holidays, 10.0) as bank_holidays,
    COALESCE(su.christmas_closure_days, 5.0) as christmas_closure,
    COALESCE(su.public_holidays, 10.0) + COALESCE(su.christmas_closure_days, 5.0) as mandatory_deductions
  FROM public.system_users su
  LEFT JOIN (
    SELECT 
      hr.system_user_id,
      SUM(hr.total_days) as personal_taken
    FROM public.holiday_requests hr
    WHERE hr.status = 'approved'
      AND hr.absence_type = 'annual_leave'
      AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM NOW())
    GROUP BY hr.system_user_id
  ) used_annual ON used_annual.system_user_id = su.id
  LEFT JOIN (
    SELECT 
      hr.system_user_id,
      SUM(hr.total_days) as personal_taken
    FROM public.holiday_requests hr
    WHERE hr.status = 'approved'
      AND hr.absence_type IN ('compassionate_leave', 'study_leave')
      AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM NOW())
    GROUP BY hr.system_user_id
  ) used_personal ON used_personal.system_user_id = su.id
  WHERE su.id::text = target_user_id OR su.user_id::text = target_user_id;
END;
$function$;