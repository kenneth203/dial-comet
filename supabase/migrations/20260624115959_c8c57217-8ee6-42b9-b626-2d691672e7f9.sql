
-- 1) Add missing entitlement columns so bank holidays + christmas closure persist
ALTER TABLE public.holiday_entitlements
  ADD COLUMN IF NOT EXISTS public_holidays numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS christmas_closure_days numeric NOT NULL DEFAULT 0;

-- 2) Fix loader: join holiday_entitlements via su.user_id (auth uid), not su.id,
--    and return real stored values for every entitlement field.
CREATE OR REPLACE FUNCTION public.get_all_system_users_for_management_secure()
RETURNS TABLE(
  id uuid, user_id uuid, name text, email text, role text, status text,
  department text, job_title text, start_date date,
  date_of_birth text, address_masked text, home_phone_masked text, mobile_phone_masked text,
  annual_leave_days numeric, sick_leave_days numeric, personal_days numeric,
  public_holidays numeric, christmas_closure_days numeric, carried_over_days numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT su.id, su.user_id, su.name, su.email, su.role, su.status,
         su.department, su.position AS job_title, su.start_date,
         'Protected'::text AS date_of_birth,
         'Protected'::text AS address_masked,
         'Protected'::text AS home_phone_masked,
         COALESCE(su.phone_number, 'Protected') AS mobile_phone_masked,
         COALESCE(he.annual_leave_entitlement, su.annual_leave_entitlement, 25) AS annual_leave_days,
         COALESCE(he.sick_leave_entitlement, 0) AS sick_leave_days,
         COALESCE(he.personal_days_entitlement, 0) AS personal_days,
         COALESCE(he.public_holidays, 0) AS public_holidays,
         COALESCE(he.christmas_closure_days, 0) AS christmas_closure_days,
         COALESCE(he.carried_over, 0) AS carried_over_days
  FROM public.system_users su
  LEFT JOIN public.holiday_entitlements he
    ON he.user_id = su.user_id
   AND he.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
  ORDER BY su.name;
END;
$function$;

-- 3) Update writer to persist public_holidays and christmas_closure_days too.
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

  IF v_user_id IS NOT NULL AND (
    p_annual_leave_days IS NOT NULL OR
    p_sick_leave_days IS NOT NULL OR
    p_personal_days IS NOT NULL OR
    p_public_holidays IS NOT NULL OR
    p_christmas_closure_days IS NOT NULL OR
    p_carried_over_days IS NOT NULL
  ) THEN
    INSERT INTO public.holiday_entitlements (
      user_id, year,
      annual_leave_entitlement, sick_leave_entitlement,
      personal_days_entitlement, public_holidays, christmas_closure_days, carried_over
    )
    VALUES (
      v_user_id, v_year,
      COALESCE(p_annual_leave_days, 25),
      COALESCE(p_sick_leave_days, 0),
      COALESCE(p_personal_days, 0),
      COALESCE(p_public_holidays, 0),
      COALESCE(p_christmas_closure_days, 0),
      COALESCE(p_carried_over_days, 0)
    )
    ON CONFLICT (user_id, year) DO UPDATE SET
      annual_leave_entitlement = COALESCE(EXCLUDED.annual_leave_entitlement, holiday_entitlements.annual_leave_entitlement),
      sick_leave_entitlement = COALESCE(EXCLUDED.sick_leave_entitlement, holiday_entitlements.sick_leave_entitlement),
      personal_days_entitlement = COALESCE(EXCLUDED.personal_days_entitlement, holiday_entitlements.personal_days_entitlement),
      public_holidays = COALESCE(EXCLUDED.public_holidays, holiday_entitlements.public_holidays),
      christmas_closure_days = COALESCE(EXCLUDED.christmas_closure_days, holiday_entitlements.christmas_closure_days),
      carried_over = COALESCE(EXCLUDED.carried_over, holiday_entitlements.carried_over),
      updated_at = now();
  END IF;
END;
$function$;
