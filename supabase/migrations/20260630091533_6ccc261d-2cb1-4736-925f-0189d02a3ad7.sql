CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(
  p_request_id uuid,
  p_override boolean DEFAULT false,
  p_convert_to_unpaid boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  req RECORD; v_days numeric; v_year int;
  v_default_annual numeric := 25.0;
  v_effective_type text;
  v_remaining numeric;
  v_entitlement numeric;
  v_used numeric;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'For security reasons, you cannot call this function.';
  END IF;

  -- Only Super-Admin may override or convert to unpaid
  IF (p_override OR p_convert_to_unpaid) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only Super-Admin can override allocation or convert to unpaid leave';
  END IF;

  SELECT * INTO req FROM public.holiday_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holiday request not found'; END IF;
  IF req.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be approved';
  END IF;

  -- Override/convert is only valid for sick_leave or compassionate_leave
  IF (p_override OR p_convert_to_unpaid)
     AND req.absence_type NOT IN ('sick_leave','compassionate_leave') THEN
    RAISE EXCEPTION 'Override/convert is only allowed for Sick Leave or Compassionate Leave';
  END IF;

  v_days := COALESCE(req.total_days, public.calculate_working_days(req.start_date, req.end_date));
  v_year := EXTRACT(YEAR FROM req.start_date)::int;

  v_effective_type := req.absence_type::text;
  IF p_convert_to_unpaid THEN
    v_effective_type := 'unpaid_leave';
  END IF;

  UPDATE public.holiday_requests
  SET status='approved'::request_status,
      approved_by=auth.uid(),
      approved_at=now(),
      absence_type = v_effective_type::absence_type,
      reason = CASE
        WHEN p_convert_to_unpaid THEN
          COALESCE(reason,'') ||
          CASE WHEN COALESCE(reason,'') = '' THEN '' ELSE E'\n' END ||
          '[Converted to Unpaid Leave by Super-Admin on ' || to_char(now(),'DD/MM/YYYY') || ']'
        WHEN p_override THEN
          COALESCE(reason,'') ||
          CASE WHEN COALESCE(reason,'') = '' THEN '' ELSE E'\n' END ||
          '[Approved with allocation override by Super-Admin on ' || to_char(now(),'DD/MM/YYYY') || ']'
        ELSE reason
      END,
      decline_reason=NULL,
      updated_at=now()
  WHERE id = p_request_id;

  -- Seed entitlement row if needed
  IF req.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.holiday_entitlements
    WHERE user_id IN (req.system_user_id, req.user_id) AND year = v_year
  ) THEN
    SELECT COALESCE(cu.annual_leave_entitlement, v_default_annual) INTO v_default_annual
    FROM public.comprehensive_users cu
    WHERE cu.auth_user_id = req.user_id OR cu.id = req.system_user_id LIMIT 1;

    INSERT INTO public.holiday_entitlements
      (user_id, year, annual_leave_entitlement, sick_leave_entitlement, personal_days_entitlement)
    VALUES (req.user_id, v_year, COALESCE(v_default_annual, 25.0), 10.0, 5.0);
  END IF;

  -- Deduct from the appropriate bucket using the effective type
  IF v_effective_type = 'annual_leave' THEN
    UPDATE public.holiday_entitlements he
    SET annual_leave_used = COALESCE(he.annual_leave_used,0)+v_days, updated_at=now()
    WHERE he.user_id IN (req.system_user_id, req.user_id) AND he.year=v_year;
  ELSIF v_effective_type = 'sick_leave' THEN
    UPDATE public.holiday_entitlements he
    SET sick_leave_used = COALESCE(he.sick_leave_used,0)+v_days, updated_at=now()
    WHERE he.user_id IN (req.system_user_id, req.user_id) AND he.year=v_year;
  ELSIF v_effective_type IN ('compassionate_leave','study_leave') THEN
    UPDATE public.holiday_entitlements he
    SET personal_days_used = COALESCE(he.personal_days_used,0)+v_days, updated_at=now()
    WHERE he.user_id IN (req.system_user_id, req.user_id) AND he.year=v_year;
  END IF;
  -- unpaid_leave / maternity / paternity / public_holiday: no deduction

  RETURN to_jsonb((SELECT hr FROM public.holiday_requests hr WHERE hr.id = p_request_id));
END; $function$;