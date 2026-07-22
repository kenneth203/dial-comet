-- Drop existing function and create the new comprehensive holiday data function
DROP FUNCTION IF EXISTS public.get_system_user_holiday_data(uuid);

CREATE OR REPLACE FUNCTION public.get_system_user_holiday_data(target_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  year integer,
  -- Totals (Annual Leave only for discretionary booking)
  total_quota numeric,
  total_used numeric,
  total_remaining numeric,
  -- Annual Leave
  annual_leave_allowed numeric,
  annual_leave_used numeric,
  annual_leave_remaining numeric,
  -- Sick Leave
  sick_leave_allowed numeric,
  sick_leave_used numeric,
  sick_leave_remaining numeric,
  -- Personal Days
  personal_days_allowed numeric,
  personal_days_used numeric,
  personal_days_remaining numeric,
  -- Public Holidays (read-only)
  public_holidays_allowed numeric,
  public_holidays_used numeric,
  public_holidays_remaining numeric,
  -- Carried Over
  carried_over_amount numeric,
  -- Raw inputs for transparency
  base_annual_leave_days numeric,
  base_sick_leave_days numeric,
  base_personal_days numeric,
  base_public_holidays numeric,
  christmas_closure_days numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_year integer := EXTRACT(YEAR FROM CURRENT_DATE);
  user_record system_users%ROWTYPE;
  annual_used numeric := 0;
  sick_used numeric := 0;
  personal_used numeric := 0;
  calculated_annual_allowed numeric;
BEGIN
  -- Get user record
  SELECT * INTO user_record FROM system_users WHERE system_users.user_id = target_user_id LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Calculate used days from approved holiday requests in current year
  SELECT 
    COALESCE(SUM(CASE WHEN hr.absence_type = 'annual_leave' THEN hr.total_days ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hr.absence_type = 'sick_leave' THEN hr.total_days ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hr.absence_type IN ('compassionate_leave', 'study_leave') THEN hr.total_days ELSE 0 END), 0)
  INTO annual_used, sick_used, personal_used
  FROM holiday_requests hr
  WHERE hr.user_id = target_user_id
    AND hr.status = 'approved'::request_status
    AND EXTRACT(YEAR FROM hr.start_date) = current_year;
  
  -- Calculate annual leave allowed (base + carried over - public holidays - christmas closure)
  calculated_annual_allowed := 
    COALESCE(user_record.annual_leave_days, 25.0) + 
    COALESCE(user_record.carried_over_days, 0.0) - 
    COALESCE(user_record.public_holidays, 10.0) - 
    COALESCE(user_record.christmas_closure_days, 5.0);
  
  -- Ensure no negative values
  calculated_annual_allowed := GREATEST(calculated_annual_allowed, 0);
  
  RETURN QUERY
  SELECT 
    target_user_id as user_id,
    current_year as year,
    -- Totals (Annual Leave only)
    calculated_annual_allowed as total_quota,
    annual_used as total_used,
    GREATEST(calculated_annual_allowed - annual_used, 0) as total_remaining,
    -- Annual Leave
    calculated_annual_allowed as annual_leave_allowed,
    annual_used as annual_leave_used,
    GREATEST(calculated_annual_allowed - annual_used, 0) as annual_leave_remaining,
    -- Sick Leave
    COALESCE(user_record.sick_leave_days, 10.0) as sick_leave_allowed,
    sick_used as sick_leave_used,
    GREATEST(COALESCE(user_record.sick_leave_days, 10.0) - sick_used, 0) as sick_leave_remaining,
    -- Personal Days
    COALESCE(user_record.personal_days, 5.0) as personal_days_allowed,
    personal_used as personal_days_used,
    GREATEST(COALESCE(user_record.personal_days, 5.0) - personal_used, 0) as personal_days_remaining,
    -- Public Holidays (read-only, all used)
    COALESCE(user_record.public_holidays, 10.0) as public_holidays_allowed,
    COALESCE(user_record.public_holidays, 10.0) as public_holidays_used,
    0::numeric as public_holidays_remaining,
    -- Carried Over
    COALESCE(user_record.carried_over_days, 0.0) as carried_over_amount,
    -- Raw inputs
    COALESCE(user_record.annual_leave_days, 25.0) as base_annual_leave_days,
    COALESCE(user_record.sick_leave_days, 10.0) as base_sick_leave_days,
    COALESCE(user_record.personal_days, 5.0) as base_personal_days,
    COALESCE(user_record.public_holidays, 10.0) as base_public_holidays,
    COALESCE(user_record.christmas_closure_days, 5.0) as christmas_closure_days;
END;
$$;