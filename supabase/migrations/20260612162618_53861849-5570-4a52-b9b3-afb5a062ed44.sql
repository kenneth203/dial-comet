CREATE OR REPLACE FUNCTION public.get_users_on_holiday_today()
RETURNS TABLE(
  request_id uuid,
  user_id uuid,
  system_user_id uuid,
  name text,
  absence_type text,
  start_date date,
  end_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hr.id AS request_id,
    hr.user_id,
    hr.system_user_id,
    COALESCE(su.name, 'Team Member') AS name,
    hr.absence_type::text,
    hr.start_date,
    hr.end_date
  FROM public.holiday_requests hr
  LEFT JOIN public.system_users su
    ON su.id = hr.system_user_id
    OR su.user_id = hr.user_id
  WHERE hr.status = 'approved'
    AND CURRENT_DATE BETWEEN hr.start_date AND hr.end_date
  ORDER BY su.name NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_on_holiday_today() TO authenticated;