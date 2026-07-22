CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  req RECORD; v_days numeric; v_year int;
  v_default_annual numeric := 25.0;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'For security reasons, you cannot call this function.';
  END IF;
  SELECT * INTO req FROM public.holiday_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holiday request not found'; END IF;
  IF req.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be approved';
  END IF;

  UPDATE public.holiday_requests
  SET status='approved'::request_status, approved_by=auth.uid(), approved_at=now(),
      decline_reason=NULL, updated_at=now()
  WHERE id = p_request_id;

  v_days := COALESCE(req.total_days, public.calculate_working_days(req.start_date, req.end_date));
  v_year := EXTRACT(YEAR FROM req.start_date)::int;

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

  IF req.absence_type = 'annual_leave' THEN
    UPDATE public.holiday_entitlements he SET annual_leave_used = COALESCE(he.annual_leave_used,0)+v_days, updated_at=now()
    WHERE he.user_id IN (req.system_user_id, req.user_id) AND he.year=v_year;
  ELSIF req.absence_type = 'sick_leave' THEN
    UPDATE public.holiday_entitlements he SET sick_leave_used = COALESCE(he.sick_leave_used,0)+v_days, updated_at=now()
    WHERE he.user_id IN (req.system_user_id, req.user_id) AND he.year=v_year;
  ELSIF req.absence_type IN ('compassionate_leave','study_leave') THEN
    UPDATE public.holiday_entitlements he SET personal_days_used = COALESCE(he.personal_days_used,0)+v_days, updated_at=now()
    WHERE he.user_id IN (req.system_user_id, req.user_id) AND he.year=v_year;
  END IF;

  RETURN to_jsonb((SELECT hr FROM public.holiday_requests hr WHERE hr.id = p_request_id));
END; $$;