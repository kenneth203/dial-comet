-- Fix security issues by updating functions with proper search_path
CREATE OR REPLACE FUNCTION public.sync_system_user_to_holiday_entitlements()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When a system_user is updated, sync their holiday data to holiday_entitlements for current year
  INSERT INTO public.holiday_entitlements (
    user_id,
    year,
    annual_leave_days,
    sick_leave_days,
    personal_days,
    carried_over_days
  )
  VALUES (
    NEW.user_id,
    EXTRACT(YEAR FROM NOW())::integer,
    COALESCE(NEW.annual_leave_days, 25.0),
    COALESCE(NEW.sick_leave_days, 10.0),
    COALESCE(NEW.personal_days, 5.0),
    COALESCE(NEW.carried_over_days, 0.0)
  )
  ON CONFLICT (user_id, year) DO UPDATE SET
    annual_leave_days = COALESCE(NEW.annual_leave_days, 25.0),
    sick_leave_days = COALESCE(NEW.sick_leave_days, 10.0),
    personal_days = COALESCE(NEW.personal_days, 5.0),
    carried_over_days = COALESCE(NEW.carried_over_days, 0.0),
    updated_at = NOW();
    
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_system_user_holiday_breakdown(target_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
  user_id uuid,
  annual_leave_days numeric,
  sick_leave_days numeric,
  personal_days numeric,
  carried_over_days numeric,
  public_holidays numeric,
  christmas_closure_days numeric,
  annual_leave_remaining numeric,
  sick_leave_remaining numeric,
  personal_days_remaining numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Get system user data and calculate remaining days
  RETURN QUERY
  SELECT 
    su.user_id,
    COALESCE(su.annual_leave_days, 25.0) as annual_leave_days,
    COALESCE(su.sick_leave_days, 10.0) as sick_leave_days,
    COALESCE(su.personal_days, 5.0) as personal_days,
    COALESCE(su.carried_over_days, 0.0) as carried_over_days,
    COALESCE(su.public_holidays, 8.0) as public_holidays,
    COALESCE(su.christmas_closure_days, 5.0) as christmas_closure_days,
    -- Calculate remaining days using the existing function
    COALESCE(rl.annual_leave_remaining, COALESCE(su.annual_leave_days, 25.0)) as annual_leave_remaining,
    COALESCE(rl.sick_leave_remaining, COALESCE(su.sick_leave_days, 10.0)) as sick_leave_remaining,
    COALESCE(rl.personal_days_remaining, COALESCE(su.personal_days, 5.0)) as personal_days_remaining
  FROM public.system_users su
  LEFT JOIN LATERAL (
    SELECT * FROM get_remaining_leave_days(su.user_id)
  ) rl ON true
  WHERE su.user_id = target_user_id;
END;
$$;