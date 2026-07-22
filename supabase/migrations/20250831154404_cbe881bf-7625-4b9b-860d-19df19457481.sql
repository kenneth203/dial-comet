
-- Create a per-user holiday overview function that mirrors the admin overview,
-- but returns only the logged-in user's data
CREATE OR REPLACE FUNCTION public.get_my_holiday_overview()
RETURNS TABLE (
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    su.id AS system_user_id,
    su.user_id AS auth_user_id,
    su.name,
    su.email,
    su.role,
    su.status,
    su.annual_leave_days AS base_annual,
    su.carried_over_days AS carried_over,
    su.public_holidays AS bank_holidays,
    su.christmas_closure_days AS christmas_closure,
    su.sick_leave_days AS sick_days,
    su.personal_days AS personal_days,
    (su.annual_leave_days + su.carried_over_days) AS available_for_booking,
    COALESCE((
      SELECT SUM(hr.total_days)
      FROM public.holiday_requests hr
      WHERE hr.system_user_id = su.id
        AND hr.status = 'approved'
        AND hr.absence_type = 'annual_leave'
        AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    ), 0) AS annual_booked,
    (su.annual_leave_days + su.carried_over_days - COALESCE((
      SELECT SUM(hr.total_days)
      FROM public.holiday_requests hr
      WHERE hr.system_user_id = su.id
        AND hr.status = 'approved'
        AND hr.absence_type = 'annual_leave'
        AND EXTRACT(YEAR FROM hr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    ), 0)) AS annual_remaining
  FROM public.system_users su
  WHERE su.user_id = auth.uid()
    AND su.status = 'Active'
  ORDER BY su.created_at DESC
  LIMIT 1;
END;
$$;
