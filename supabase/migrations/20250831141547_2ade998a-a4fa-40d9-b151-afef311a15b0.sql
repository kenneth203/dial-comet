-- Create a secure function to get the current user's system_user_id
CREATE OR REPLACE FUNCTION public.get_my_system_user_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id 
  FROM public.system_users 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$$;

-- Create a secure function to get the current user's holiday requests by system_user_id
CREATE OR REPLACE FUNCTION public.get_my_holiday_requests_by_system_user()
RETURNS TABLE(
  id uuid, 
  start_date date, 
  end_date date, 
  total_days numeric, 
  absence_type absence_type, 
  status request_status, 
  reason text, 
  decline_reason text, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone, 
  approved_by uuid, 
  approved_at timestamp with time zone,
  user_id uuid,
  system_user_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH my_system_user AS (
    SELECT id as my_system_user_id
    FROM public.system_users 
    WHERE user_id = auth.uid() 
    LIMIT 1
  )
  SELECT 
    hr.id,
    hr.start_date,
    hr.end_date,
    hr.total_days,
    hr.absence_type,
    hr.status,
    hr.reason,
    hr.decline_reason,
    hr.created_at,
    hr.updated_at,
    hr.approved_by,
    hr.approved_at,
    hr.user_id,
    hr.system_user_id
  FROM public.holiday_requests hr
  CROSS JOIN my_system_user msu
  WHERE hr.system_user_id = msu.my_system_user_id
  ORDER BY hr.created_at DESC;
$$;