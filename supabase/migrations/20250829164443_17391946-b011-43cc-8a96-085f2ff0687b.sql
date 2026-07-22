-- Update the get_system_user_holiday_data function to prioritize system_users.id
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_data(target_user_id text)
RETURNS TABLE(
  annual_leave_allowed numeric,
  annual_leave_remaining numeric,
  annual_leave_used numeric,
  sick_leave_allowed numeric,
  sick_leave_remaining numeric,
  sick_leave_used numeric,
  personal_days_allowed numeric,
  personal_days_remaining numeric,
  personal_days_used numeric,
  public_holidays numeric,
  carried_over_days numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  user_record RECORD;
BEGIN
  -- First try to find by system_users.id, then fall back to user_id
  SELECT * INTO user_record
  FROM public.system_users su
  WHERE su.id::text = target_user_id
     OR (su.user_id::text = target_user_id AND su.id::text = target_user_id)
  ORDER BY 
    CASE WHEN su.id::text = target_user_id THEN 1 ELSE 2 END,
    su.updated_at DESC
  LIMIT 1;
  
  -- If no match by id, try user_id for backward compatibility
  IF NOT FOUND THEN
    SELECT * INTO user_record
    FROM public.system_users su
    WHERE su.user_id::text = target_user_id
    ORDER BY su.updated_at DESC
    LIMIT 1;
  END IF;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate used days for this specific user record
  WITH used_days AS (
    SELECT 
      COALESCE(SUM(CASE WHEN hr.absence_type = 'annual_leave' AND hr.status = 'approved' THEN hr.total_days ELSE 0 END), 0) as annual_used,
      COALESCE(SUM(CASE WHEN hr.absence_type = 'sick_leave' AND hr.status = 'approved' THEN hr.total_days ELSE 0 END), 0) as sick_used,
      COALESCE(SUM(CASE WHEN hr.absence_type IN ('compassionate_leave', 'study_leave') AND hr.status = 'approved' THEN hr.total_days ELSE 0 END), 0) as personal_used
    FROM public.holiday_requests hr
    WHERE hr.user_id = user_record.user_id 
      AND EXTRACT(YEAR FROM hr.start_date) = current_year
  )
  RETURN QUERY
  SELECT 
    COALESCE(user_record.annual_leave_days, 25.0) as annual_leave_allowed,
    COALESCE(user_record.annual_leave_days, 25.0) - ud.annual_used as annual_leave_remaining,
    ud.annual_used as annual_leave_used,
    COALESCE(user_record.sick_leave_days, 10.0) as sick_leave_allowed,
    COALESCE(user_record.sick_leave_days, 10.0) - ud.sick_used as sick_leave_remaining,
    ud.sick_used as sick_leave_used,
    COALESCE(user_record.personal_days, 5.0) as personal_days_allowed,
    COALESCE(user_record.personal_days, 5.0) - ud.personal_used as personal_days_remaining,
    ud.personal_used as personal_days_used,
    COALESCE(user_record.public_holidays, 8.0) as public_holidays,
    COALESCE(user_record.carried_over_days, 0.0) as carried_over_days
  FROM used_days ud;
END;
$$;