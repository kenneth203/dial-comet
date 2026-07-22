-- Create or update the RPC function to include christmas_closure_days
CREATE OR REPLACE FUNCTION public.get_all_system_users_for_management()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  email text,
  role text,
  status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  title text,
  date_of_birth date,
  current_address text,
  current_post_code text,
  permanent_address text,
  permanent_post_code text,
  home_phone text,
  mobile_phone text,
  national_insurance text,
  gender text,
  ethnicity text,
  nationality text,
  disability text,
  disability_category text,
  marital_status text,
  emergency_name text,
  emergency_relationship text,
  emergency_address text,
  emergency_phone text,
  bank_name text,
  bank_address text,
  account_number text,
  sort_code text,
  job_title text,
  department text,
  start_date date,
  annual_leave_days numeric,
  sick_leave_days numeric,
  personal_days numeric,
  public_holidays numeric,
  christmas_closure_days numeric,
  carried_over_days numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only allow HR, Admin, and Super-Admin to access all system users
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
    AND status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only HR, Admin, and Super-Admin can access all system users';
  END IF;

  RETURN QUERY
  SELECT 
    su.id,
    su.user_id,
    su.name,
    su.email,
    su.role,
    su.status,
    su.created_at,
    su.updated_at,
    su.title,
    su.date_of_birth,
    su.current_address,
    su.current_post_code,
    su.permanent_address,
    su.permanent_post_code,
    su.home_phone,
    su.mobile_phone,
    su.national_insurance,
    su.gender,
    su.ethnicity,
    su.nationality,
    su.disability,
    su.disability_category,
    su.marital_status,
    su.emergency_name,
    su.emergency_relationship,
    su.emergency_address,
    su.emergency_phone,
    su.bank_name,
    su.bank_address,
    su.account_number,
    su.sort_code,
    su.job_title,
    su.department,
    su.start_date,
    su.annual_leave_days,
    su.sick_leave_days,
    su.personal_days,
    su.public_holidays,
    su.christmas_closure_days,
    su.carried_over_days
  FROM public.system_users su
  ORDER BY su.name;
END;
$$;