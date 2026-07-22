-- Create function to upsert leave quota defaults
CREATE OR REPLACE FUNCTION public.upsert_leave_quota_defaults(
  target_year integer,
  p_base_annual numeric,
  p_bank_holidays numeric, 
  p_christmas_closure_days numeric
)
RETURNS leave_quota_defaults
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result leave_quota_defaults;
BEGIN
  -- Check admin permission
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can manage leave quota defaults';
  END IF;

  -- Insert or update the leave quota defaults
  INSERT INTO public.leave_quota_defaults (
    year, base_annual, bank_holidays, christmas_closure_days
  ) VALUES (
    target_year, p_base_annual, p_bank_holidays, p_christmas_closure_days
  )
  ON CONFLICT (year) DO UPDATE SET
    base_annual = EXCLUDED.base_annual,
    bank_holidays = EXCLUDED.bank_holidays,
    christmas_closure_days = EXCLUDED.christmas_closure_days,
    updated_at = now();

  -- Return the updated record
  SELECT * INTO result FROM public.leave_quota_defaults WHERE year = target_year;
  RETURN result;
END;
$$;

-- Create function to apply leave quota defaults to all active users
CREATE OR REPLACE FUNCTION public.apply_leave_quota_defaults(target_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quota_record leave_quota_defaults;
  updated_count integer := 0;
BEGIN
  -- Check admin permission
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can apply leave quotas to users';
  END IF;

  -- Get the quota defaults for the target year
  SELECT * INTO quota_record 
  FROM public.leave_quota_defaults 
  WHERE year = target_year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No leave quota defaults found for year %', target_year;
  END IF;

  -- Update all active system users with the new quotas
  UPDATE public.system_users 
  SET 
    annual_leave_days = quota_record.base_annual,
    public_holidays = quota_record.bank_holidays,
    christmas_closure_days = quota_record.christmas_closure_days,
    holiday_year = target_year,
    updated_at = now()
  WHERE status = 'Active';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Update the applied_at timestamp in leave_quota_defaults
  UPDATE public.leave_quota_defaults 
  SET applied_at = now() 
  WHERE year = target_year;

  -- Return success info
  RETURN jsonb_build_object(
    'success', true,
    'updated_users', updated_count,
    'year', target_year,
    'base_annual', quota_record.base_annual,
    'bank_holidays', quota_record.bank_holidays,
    'christmas_closure_days', quota_record.christmas_closure_days
  );
END;
$$;