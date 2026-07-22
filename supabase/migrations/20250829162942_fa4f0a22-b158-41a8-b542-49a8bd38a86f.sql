
-- 1) Ensure updated_at is maintained on updates
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_system_users_updated_at ON public.system_users;

CREATE TRIGGER set_system_users_updated_at
BEFORE UPDATE ON public.system_users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 2) Deduplicate system_users by user_id (keep most recent by updated_at/created_at, then id)
WITH ranked AS (
  SELECT
    id,
    user_id,
    created_at,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    ) AS rn
  FROM public.system_users
)
DELETE FROM public.system_users su
USING ranked r
WHERE su.id = r.id
  AND r.rn > 1;

-- 3) Enforce uniqueness so duplicates can’t reappear
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_system_users_user_id'
  ) THEN
    CREATE UNIQUE INDEX uq_system_users_user_id ON public.system_users(user_id);
  END IF;
END$$;

-- 4) Remove older overloaded versions of the RPC to avoid ambiguity
DROP FUNCTION IF EXISTS public.get_system_user_holiday_data(uuid, integer);
DROP FUNCTION IF EXISTS public.get_system_user_holiday_data(uuid);

-- 5) Recreate a single definitive RPC using target_user_id and always selecting the newest row
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_data(target_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  year integer,
  -- Totals (Annual Leave only for discretionary booking)
  total_quota numeric,
  total_used numeric,
  total_remaining numeric,
  -- Annual Leave
  annual_leave_allowed numeric,
  annual_leave_used numeric,
  annual_leave_remaining numeric,
  -- Sick Leave
  sick_leave_allowed numeric,
  sick_leave_used numeric,
  sick_leave_remaining numeric,
  -- Personal Days
  personal_days_allowed numeric,
  personal_days_used numeric,
  personal_days_remaining numeric,
  -- Public Holidays (combined & read-only)
  public_holidays_allowed numeric,
  public_holidays_used numeric,
  public_holidays_remaining numeric,
  -- Carried Over
  carried_over_amount numeric,
  -- Raw inputs for transparency
  base_annual_leave_days numeric,
  base_sick_leave_days numeric,
  base_personal_days numeric,
  base_public_holidays numeric,
  christmas_closure_days numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_year integer := EXTRACT(YEAR FROM CURRENT_DATE);
  user_record system_users%ROWTYPE;
  annual_used numeric := 0;
  sick_used numeric := 0;
  personal_used numeric := 0;
  calculated_annual_allowed numeric;
  total_bank_holidays_deduction numeric;
BEGIN
  -- Always select the most recent row for the given auth user_id
  SELECT * INTO user_record
  FROM public.system_users
  WHERE user_id = target_user_id
  ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Used days (approved) in current year
  SELECT 
    COALESCE(SUM(CASE WHEN hr.absence_type = 'annual_leave' THEN hr.total_days ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hr.absence_type = 'sick_leave' THEN hr.total_days ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hr.absence_type IN ('compassionate_leave','study_leave') THEN hr.total_days ELSE 0 END), 0)
  INTO annual_used, sick_used, personal_used
  FROM public.holiday_requests hr
  WHERE hr.user_id = target_user_id
    AND hr.status = 'approved'::request_status
    AND EXTRACT(YEAR FROM hr.start_date) = current_year;

  -- Bank Holiday/Closures = bank holidays + christmas closure (read-only)
  total_bank_holidays_deduction :=
    COALESCE(user_record.public_holidays, 10.0) +
    COALESCE(user_record.christmas_closure_days, 5.0);

  -- Allowed annual leave = base + carried over - bank holidays - xmas closure (clamped at 0)
  calculated_annual_allowed :=
    COALESCE(user_record.annual_leave_days, 25.0) +
    COALESCE(user_record.carried_over_days, 0.0) -
    total_bank_holidays_deduction;

  calculated_annual_allowed := GREATEST(calculated_annual_allowed, 0);

  RETURN QUERY
  SELECT 
    target_user_id as user_id,
    current_year as year,
    -- Totals
    calculated_annual_allowed as total_quota,
    annual_used as total_used,
    GREATEST(calculated_annual_allowed - annual_used, 0) as total_remaining,
    -- Annual Leave
    calculated_annual_allowed as annual_leave_allowed,
    annual_used as annual_leave_used,
    GREATEST(calculated_annual_allowed - annual_used, 0) as annual_leave_remaining,
    -- Sick Leave
    COALESCE(user_record.sick_leave_days, 10.0) as sick_leave_allowed,
    sick_used as sick_leave_used,
    GREATEST(COALESCE(user_record.sick_leave_days, 10.0) - sick_used, 0) as sick_leave_remaining,
    -- Personal Days
    COALESCE(user_record.personal_days, 5.0) as personal_days_allowed,
    personal_used as personal_days_used,
    GREATEST(COALESCE(user_record.personal_days, 5.0) - personal_used, 0) as personal_days_remaining,
    -- Public Holidays (combined & read-only)
    total_bank_holidays_deduction as public_holidays_allowed,
    total_bank_holidays_deduction as public_holidays_used,
    0::numeric as public_holidays_remaining,
    -- Carried Over
    COALESCE(user_record.carried_over_days, 0.0) as carried_over_amount,
    -- Raw inputs for transparency
    COALESCE(user_record.annual_leave_days, 25.0) as base_annual_leave_days,
    COALESCE(user_record.sick_leave_days, 10.0) as base_sick_leave_days,
    COALESCE(user_record.personal_days, 5.0) as base_personal_days,
    COALESCE(user_record.public_holidays, 10.0) as base_public_holidays,
    COALESCE(user_record.christmas_closure_days, 5.0) as christmas_closure_days;
END;
$$;
