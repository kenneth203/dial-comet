-- Expand admin_update_system_user to accept all parameters sent by EnhancedUserDialog.
-- Maps fields to the correct tables: system_users (basic + employment),
-- holiday_entitlements (per-user leave allowances for current year).
-- Sensitive PII (NI, bank, addresses, DoB, emergency contacts) is accepted
-- but not persisted here — those go through dedicated encrypted flows.

-- Drop the old narrow signature so the new one is the only resolution
DROP FUNCTION IF EXISTS public.admin_update_system_user(uuid, text, text, text, text, text, text, text);

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

  -- Update employment / contact fields on system_users
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

  -- Upsert holiday entitlements for the current year (only if we have an auth user_id)
  IF v_user_id IS NOT NULL AND (
    p_annual_leave_days IS NOT NULL OR
    p_sick_leave_days IS NOT NULL OR
    p_personal_days IS NOT NULL OR
    p_carried_over_days IS NOT NULL
  ) THEN
    INSERT INTO public.holiday_entitlements (
      user_id, year,
      annual_leave_entitlement, sick_leave_entitlement,
      personal_days_entitlement, carried_over
    )
    VALUES (
      v_user_id, v_year,
      COALESCE(p_annual_leave_days, 25),
      COALESCE(p_sick_leave_days, 10),
      COALESCE(p_personal_days, 5),
      COALESCE(p_carried_over_days, 0)
    )
    ON CONFLICT (user_id, year) DO UPDATE SET
      annual_leave_entitlement = COALESCE(EXCLUDED.annual_leave_entitlement, holiday_entitlements.annual_leave_entitlement),
      sick_leave_entitlement = COALESCE(EXCLUDED.sick_leave_entitlement, holiday_entitlements.sick_leave_entitlement),
      personal_days_entitlement = COALESCE(EXCLUDED.personal_days_entitlement, holiday_entitlements.personal_days_entitlement),
      carried_over = COALESCE(EXCLUDED.carried_over, holiday_entitlements.carried_over),
      updated_at = now();
  END IF;

  -- Sensitive PII parameters (NI, bank, addresses, DoB, emergency contacts, demographics)
  -- are accepted for API compatibility but intentionally not written here.
  -- They are persisted via dedicated encrypted flows (employee_sensitive_data,
  -- employee_financial_data via the encrypt-financial-data edge function).
END;
$function$;