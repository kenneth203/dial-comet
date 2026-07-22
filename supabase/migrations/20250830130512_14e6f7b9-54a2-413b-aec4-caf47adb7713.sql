-- Create secure function to get holiday admin overview for all active users
CREATE OR REPLACE FUNCTION public.get_holiday_admin_overview(leave_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer)
RETURNS TABLE(
  system_user_id uuid,
  auth_user_id uuid,
  name text,
  email text,
  role text,
  status text,
  base_annual numeric,
  carried_over numeric,
  bank_holidays numeric,
  christmas_closure numeric,
  sick_days numeric,
  personal_days numeric,
  available_for_booking numeric,
  annual_booked numeric,
  annual_remaining numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only allow admin access
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can view holiday overview';
  END IF;
  
  RETURN QUERY
  SELECT 
    su.id as system_user_id,
    su.user_id as auth_user_id,
    su.name,
    su.email,
    su.role,
    su.status,
    COALESCE(su.annual_leave_days, 25.0) as base_annual,
    COALESCE(su.carried_over_days, 0.0) as carried_over,
    COALESCE(su.public_holidays, 10.0) as bank_holidays,
    COALESCE(su.christmas_closure_days, 5.0) as christmas_closure,
    COALESCE(su.sick_leave_days, 10.0) as sick_days,
    COALESCE(su.personal_days, 5.0) as personal_days,
    -- Available for booking = Base Annual + Carried Over - Bank Holidays - Christmas Closure
    (COALESCE(su.annual_leave_days, 25.0) + COALESCE(su.carried_over_days, 0.0) - COALESCE(su.public_holidays, 10.0) - COALESCE(su.christmas_closure_days, 5.0)) as available_for_booking,
    -- Days booked = sum of approved annual leave requests for the year
    COALESCE(booked.annual_booked, 0.0) as annual_booked,
    -- Days remaining = Available for booking - Days booked
    (COALESCE(su.annual_leave_days, 25.0) + COALESCE(su.carried_over_days, 0.0) - COALESCE(su.public_holidays, 10.0) - COALESCE(su.christmas_closure_days, 5.0) - COALESCE(booked.annual_booked, 0.0)) as annual_remaining
  FROM public.system_users su
  LEFT JOIN (
    SELECT 
      hr.user_id,
      SUM(hr.total_days) as annual_booked
    FROM public.holiday_requests hr
    WHERE hr.status = 'approved'::request_status
      AND hr.absence_type = 'annual_leave'::absence_type
      AND EXTRACT(YEAR FROM hr.start_date) = leave_year
    GROUP BY hr.user_id
  ) booked ON booked.user_id = su.user_id
  WHERE su.status = 'Active'
  ORDER BY su.name;
END;
$$;