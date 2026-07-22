-- Fix the function to return all system users for management
CREATE OR REPLACE FUNCTION public.get_all_system_users_for_management()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  role text,
  status text,
  email text,
  -- Personal details
  title text,
  date_of_birth date,
  current_address text,
  current_post_code text,
  permanent_address text,
  permanent_post_code text,
  home_phone text,
  mobile_phone text,
  national_insurance text,
  -- Monitoring information
  gender text,
  ethnicity text,
  nationality text,
  disability text,
  disability_category text,
  marital_status text,
  -- Emergency contact
  emergency_name text,
  emergency_relationship text,
  emergency_address text,
  emergency_phone text,
  -- Bank details
  bank_name text,
  bank_address text,
  account_number text,
  sort_code text,
  -- Employment details
  job_title text,
  department text,
  start_date date,
  -- Holiday entitlements
  annual_leave_days numeric,
  sick_leave_days numeric,
  personal_days numeric,
  public_holidays numeric,
  carried_over_days numeric
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    system_users.id,
    system_users.user_id,
    system_users.name,
    system_users.role,
    system_users.status,
    system_users.email,
    -- Personal details
    system_users.title,
    system_users.date_of_birth,
    system_users.current_address,
    system_users.current_post_code,
    system_users.permanent_address,
    system_users.permanent_post_code,
    system_users.home_phone,
    system_users.mobile_phone,
    system_users.national_insurance,
    -- Monitoring information
    system_users.gender,
    system_users.ethnicity,
    system_users.nationality,
    system_users.disability,
    system_users.disability_category,
    system_users.marital_status,
    -- Emergency contact
    system_users.emergency_name,
    system_users.emergency_relationship,
    system_users.emergency_address,
    system_users.emergency_phone,
    -- Bank details
    system_users.bank_name,
    system_users.bank_address,
    system_users.account_number,
    system_users.sort_code,
    -- Employment details
    system_users.job_title,
    system_users.department,
    system_users.start_date,
    -- Holiday entitlements
    system_users.annual_leave_days,
    system_users.sick_leave_days,
    system_users.personal_days,
    system_users.public_holidays,
    system_users.carried_over_days
  FROM public.system_users 
  ORDER BY system_users.name;
$$;