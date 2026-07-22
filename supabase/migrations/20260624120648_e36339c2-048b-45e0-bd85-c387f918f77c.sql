CREATE OR REPLACE FUNCTION public.admin_update_system_user(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_current_address text DEFAULT NULL,
  p_current_post_code text DEFAULT NULL,
  p_permanent_address text DEFAULT NULL,
  p_permanent_post_code text DEFAULT NULL,
  p_home_phone text DEFAULT NULL,
  p_mobile_phone text DEFAULT NULL,
  p_national_insurance text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_ethnicity text DEFAULT NULL,
  p_nationality text DEFAULT NULL,
  p_disability text DEFAULT NULL,
  p_disability_category text DEFAULT NULL,
  p_marital_status text DEFAULT NULL,
  p_emergency_name text DEFAULT NULL,
  p_emergency_relationship text DEFAULT NULL,
  p_emergency_address text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_bank_address text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_sort_code text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_annual_leave_days numeric DEFAULT NULL,
  p_sick_leave_days numeric DEFAULT NULL,
  p_personal_days numeric DEFAULT NULL,
  p_public_holidays numeric DEFAULT NULL,
  p_christmas_closure_days numeric DEFAULT NULL,
  p_carried_over_days numeric DEFAULT NULL,
  p_start_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.system_users SET
    name = COALESCE(p_name, name),
    email = COALESCE(p_email, email),
    role = COALESCE(p_role, role),
    status = COALESCE(p_status, status),
    department = COALESCE(p_department, department),
    position = COALESCE(p_job_title, position),
    phone_number = COALESCE(p_mobile_phone, phone_number),
    start_date = COALESCE(p_start_date, start_date),
    annual_leave_entitlement = COALESCE(p_annual_leave_days, annual_leave_entitlement),
    updated_at = now()
  WHERE id = p_id
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_annual_leave_days IS NOT NULL OR
     p_sick_leave_days IS NOT NULL OR
     p_personal_days IS NOT NULL OR
     p_public_holidays IS NOT NULL OR
     p_christmas_closure_days IS NOT NULL OR
     p_carried_over_days IS NOT NULL THEN
    INSERT INTO public.holiday_entitlements (
      user_id,
      year,
      annual_leave_entitlement,
      sick_leave_entitlement,
      personal_days_entitlement,
      public_holidays,
      christmas_closure_days,
      carried_over
    )
    SELECT
      v_user_id,
      v_year,
      COALESCE(p_annual_leave_days, su.annual_leave_entitlement, 25),
      COALESCE(p_sick_leave_days, 0),
      COALESCE(p_personal_days, 0),
      COALESCE(p_public_holidays, 0),
      COALESCE(p_christmas_closure_days, 0),
      COALESCE(p_carried_over_days, 0)
    FROM public.system_users su
    WHERE su.id = p_id
    ON CONFLICT (user_id, year) DO UPDATE SET
      annual_leave_entitlement = COALESCE(p_annual_leave_days, holiday_entitlements.annual_leave_entitlement),
      sick_leave_entitlement = COALESCE(p_sick_leave_days, holiday_entitlements.sick_leave_entitlement),
      personal_days_entitlement = COALESCE(p_personal_days, holiday_entitlements.personal_days_entitlement),
      public_holidays = COALESCE(p_public_holidays, holiday_entitlements.public_holidays),
      christmas_closure_days = COALESCE(p_christmas_closure_days, holiday_entitlements.christmas_closure_days),
      carried_over = COALESCE(p_carried_over_days, holiday_entitlements.carried_over),
      updated_at = now();
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_holiday_admin_overview(integer);

CREATE FUNCTION public.get_holiday_admin_overview(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS TABLE(
  auth_user_id uuid,
  system_user_id uuid,
  name text,
  email text,
  role text,
  department text,
  annual_leave_entitlement numeric,
  annual_leave_used numeric,
  sick_leave_entitlement numeric,
  sick_leave_used numeric,
  personal_days_entitlement numeric,
  personal_days_used numeric,
  carried_over numeric,
  bank_holidays numeric,
  christmas_closure numeric,
  pending_requests bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    su.user_id AS auth_user_id,
    su.id AS system_user_id,
    su.name,
    su.email,
    su.role,
    COALESCE(su.department, '') AS department,
    COALESCE(he.annual_leave_entitlement, su.annual_leave_entitlement, 25) AS annual_leave_entitlement,
    COALESCE(he.annual_leave_used, 0) AS annual_leave_used,
    COALESCE(he.sick_leave_entitlement, 0) AS sick_leave_entitlement,
    COALESCE(he.sick_leave_used, 0) AS sick_leave_used,
    COALESCE(he.personal_days_entitlement, 0) AS personal_days_entitlement,
    COALESCE(he.personal_days_used, 0) AS personal_days_used,
    COALESCE(he.carried_over, 0) AS carried_over,
    COALESCE(he.public_holidays, 0) AS bank_holidays,
    COALESCE(he.christmas_closure_days, 0) AS christmas_closure,
    (SELECT COUNT(*) FROM public.holiday_requests hr
     WHERE (hr.user_id = su.user_id OR hr.system_user_id = su.id) AND lower(hr.status::text) = 'pending') AS pending_requests
  FROM public.system_users su
  LEFT JOIN public.holiday_entitlements he
    ON he.user_id = su.user_id
   AND he.year = p_year
  WHERE su.status = 'Active'
  ORDER BY su.name;
$function$;