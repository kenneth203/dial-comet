-- Fix the get_system_user_holiday_breakdown function to use the correct user-specific christmas_closure_days
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_breakdown()
RETURNS TABLE(
  user_id uuid,
  name text,
  base_entitlement numeric,
  bank_holidays numeric,
  christmas_closure numeric,
  mandatory_deductions numeric,
  personal_allowance_available numeric,
  personal_taken numeric,
  personal_remaining numeric,
  sick_leave_remaining numeric,
  personal_days_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    su.user_id,
    su.name,
    COALESCE(su.annual_leave_days, 25.0) as base_entitlement,
    COALESCE(su.public_holidays, 10.0) as bank_holidays,
    COALESCE(su.christmas_closure_days, 5.0) as christmas_closure,
    (COALESCE(su.public_holidays, 10.0) + COALESCE(su.christmas_closure_days, 5.0)) as mandatory_deductions,
    (COALESCE(su.annual_leave_days, 25.0) - COALESCE(su.public_holidays, 10.0) - COALESCE(su.christmas_closure_days, 5.0)) as personal_allowance_available,
    COALESCE((
      SELECT SUM(total_days) 
      FROM holiday_requests hr 
      WHERE hr.user_id = su.user_id 
        AND hr.status = 'approved'::request_status 
        AND hr.absence_type = 'annual_leave'::absence_type
        AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    ), 0.0) as personal_taken,
    (COALESCE(su.annual_leave_days, 25.0) - COALESCE(su.public_holidays, 10.0) - COALESCE(su.christmas_closure_days, 5.0) - COALESCE((
      SELECT SUM(total_days) 
      FROM holiday_requests hr 
      WHERE hr.user_id = su.user_id 
        AND hr.status = 'approved'::request_status 
        AND hr.absence_type = 'annual_leave'::absence_type
        AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    ), 0.0)) as personal_remaining,
    (COALESCE(su.sick_leave_days, 10.0) - COALESCE((
      SELECT SUM(total_days) 
      FROM holiday_requests hr 
      WHERE hr.user_id = su.user_id 
        AND hr.status = 'approved'::request_status 
        AND hr.absence_type = 'sick_leave'::absence_type
        AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    ), 0.0)) as sick_leave_remaining,
    (COALESCE(su.personal_days, 5.0) - COALESCE((
      SELECT SUM(total_days) 
      FROM holiday_requests hr 
      WHERE hr.user_id = su.user_id 
        AND hr.status = 'approved'::request_status 
        AND hr.absence_type IN ('compassionate_leave'::absence_type, 'study_leave'::absence_type)
        AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    ), 0.0)) as personal_days_remaining
  FROM system_users su
  WHERE su.user_id = auth.uid()
  LIMIT 1;
END;
$$;