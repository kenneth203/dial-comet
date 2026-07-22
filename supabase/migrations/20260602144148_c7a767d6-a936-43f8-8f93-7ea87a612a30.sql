ALTER TABLE public.holiday_requests
  ADD COLUMN IF NOT EXISTS total_days numeric,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

UPDATE public.holiday_requests
SET reason = COALESCE(reason, notes)
WHERE reason IS NULL AND notes IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_holiday_request_reason_notes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reason IS NULL AND NEW.notes IS NOT NULL THEN
    NEW.reason := NEW.notes;
  ELSIF NEW.notes IS NULL AND NEW.reason IS NOT NULL THEN
    NEW.notes := NEW.reason;
  ELSIF NEW.reason IS DISTINCT FROM OLD.reason AND NEW.notes IS NOT DISTINCT FROM OLD.notes THEN
    NEW.notes := NEW.reason;
  ELSIF NEW.notes IS DISTINCT FROM OLD.notes AND NEW.reason IS NOT DISTINCT FROM OLD.reason THEN
    NEW.reason := NEW.notes;
  ELSIF NEW.reason IS NULL AND NEW.notes IS NULL THEN
    NEW.reason := NULL;
    NEW.notes := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_holiday_request_reason_notes ON public.holiday_requests;
CREATE TRIGGER sync_holiday_request_reason_notes
BEFORE INSERT OR UPDATE ON public.holiday_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_holiday_request_reason_notes();

UPDATE public.holiday_requests
SET total_days = public.calculate_working_days(start_date, end_date)
WHERE total_days IS NULL;

CREATE OR REPLACE FUNCTION public.create_holiday_request_secure(
  p_absence_type text,
  p_start_date date,
  p_end_date date,
  p_reason text DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  target_system_user_id uuid;
  calculated_days numeric;
  overlapping_count integer := 0;
  new_request_id uuid;
BEGIN
  IF p_target_user_id IS NOT NULL AND public.is_admin_or_higher() THEN
    SELECT su.user_id, su.id
    INTO target_user_id, target_system_user_id
    FROM public.system_users su
    WHERE su.id = p_target_user_id
    LIMIT 1;

    IF target_system_user_id IS NULL THEN
      RAISE EXCEPTION 'System user not found for the given ID';
    END IF;
  ELSE
    target_user_id := auth.uid();

    SELECT su.id
    INTO target_system_user_id
    FROM public.system_users su
    WHERE su.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create a holiday request';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Start date and end date are required';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Start date must be before or equal to end date';
  END IF;

  IF p_start_date < CURRENT_DATE AND p_absence_type <> 'sick_leave' AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Cannot create holiday requests for past dates';
  END IF;

  calculated_days := public.calculate_working_days(p_start_date, p_end_date);

  SELECT COUNT(*) INTO overlapping_count
  FROM public.holiday_requests hr
  WHERE (hr.user_id = target_user_id OR (target_system_user_id IS NOT NULL AND hr.system_user_id = target_system_user_id))
    AND hr.status IN ('pending', 'approved')
    AND (
      (p_start_date BETWEEN hr.start_date AND hr.end_date) OR
      (p_end_date BETWEEN hr.start_date AND hr.end_date) OR
      (hr.start_date BETWEEN p_start_date AND p_end_date)
    );

  IF overlapping_count > 0 THEN
    RAISE EXCEPTION 'Overlapping holiday request already exists for this period';
  END IF;

  INSERT INTO public.holiday_requests (
    user_id,
    system_user_id,
    absence_type,
    start_date,
    end_date,
    total_days,
    reason,
    notes,
    status
  ) VALUES (
    target_user_id,
    target_system_user_id,
    p_absence_type::absence_type,
    p_start_date,
    p_end_date,
    calculated_days,
    p_reason,
    p_reason,
    'pending'::request_status
  ) RETURNING id INTO new_request_id;

  RETURN new_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'For security reasons, you cannot call this function.';
  END IF;

  SELECT * INTO req
  FROM public.holiday_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday request not found';
  END IF;

  IF req.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be approved';
  END IF;

  UPDATE public.holiday_requests
  SET
    status = 'approved'::request_status,
    approved_by = auth.uid(),
    approved_at = now(),
    decline_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  IF req.absence_type = 'annual_leave' THEN
    UPDATE public.holiday_entitlements he
    SET annual_leave_used = COALESCE(he.annual_leave_used, 0) + COALESCE(req.total_days, public.calculate_working_days(req.start_date, req.end_date)),
        updated_at = now()
    WHERE he.user_id IN (req.system_user_id, req.user_id)
      AND he.year = EXTRACT(YEAR FROM req.start_date)::int;
  ELSIF req.absence_type = 'sick_leave' THEN
    UPDATE public.holiday_entitlements he
    SET sick_leave_used = COALESCE(he.sick_leave_used, 0) + COALESCE(req.total_days, public.calculate_working_days(req.start_date, req.end_date)),
        updated_at = now()
    WHERE he.user_id IN (req.system_user_id, req.user_id)
      AND he.year = EXTRACT(YEAR FROM req.start_date)::int;
  ELSIF req.absence_type IN ('compassionate_leave', 'study_leave') THEN
    UPDATE public.holiday_entitlements he
    SET personal_days_used = COALESCE(he.personal_days_used, 0) + COALESCE(req.total_days, public.calculate_working_days(req.start_date, req.end_date)),
        updated_at = now()
    WHERE he.user_id IN (req.system_user_id, req.user_id)
      AND he.year = EXTRACT(YEAR FROM req.start_date)::int;
  END IF;

  RETURN to_jsonb((SELECT hr FROM public.holiday_requests hr WHERE hr.id = p_request_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_holiday_request_secure(
  request_id uuid,
  p_decline_reason text,
  approver_id uuid DEFAULT auth.uid()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RETURN 'ERROR: Only administrators can decline holiday requests';
  END IF;

  SELECT * INTO req
  FROM public.holiday_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'ERROR: Request not found';
  END IF;

  IF req.status <> 'pending'::request_status THEN
    RETURN 'ERROR: Only pending requests can be declined';
  END IF;

  UPDATE public.holiday_requests
  SET
    status = 'declined'::request_status,
    decline_reason = p_decline_reason,
    approved_by = approver_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = request_id;

  RETURN 'SUCCESS: Holiday request declined';
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_holiday_request_secure(request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_request public.holiday_requests%ROWTYPE;
  current_user_id uuid;
  user_system_id uuid;
BEGIN
  current_user_id := auth.uid();

  SELECT su.id INTO user_system_id
  FROM public.system_users su
  WHERE su.user_id = current_user_id
  LIMIT 1;

  SELECT * INTO current_request
  FROM public.holiday_requests hr
  WHERE hr.id = request_id
    AND (hr.user_id = current_user_id OR hr.system_user_id = user_system_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday request not found or access denied';
  END IF;

  IF current_request.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be cancelled. Current status: %', current_request.status;
  END IF;

  IF current_request.start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot cancel requests that have already started';
  END IF;

  UPDATE public.holiday_requests
  SET status = 'cancelled'::request_status,
      updated_at = now()
  WHERE id = request_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_holiday_overview(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS TABLE(
  entitlement_id uuid,
  annual_leave_entitlement numeric,
  annual_leave_used numeric,
  sick_leave_entitlement numeric,
  sick_leave_used numeric,
  personal_days_entitlement numeric,
  personal_days_used numeric,
  carried_over numeric,
  requests json
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_user_id uuid;
BEGIN
  SELECT su.id INTO v_system_user_id
  FROM public.system_users su
  WHERE su.user_id = auth.uid()
  LIMIT 1;

  RETURN QUERY
  WITH my_requests AS (
    SELECT COALESCE(json_agg(row_to_json(hr) ORDER BY hr.created_at DESC), '[]'::json) AS requests_json
    FROM public.holiday_requests hr
    WHERE (hr.user_id = auth.uid() OR (v_system_user_id IS NOT NULL AND hr.system_user_id = v_system_user_id))
      AND EXTRACT(YEAR FROM hr.start_date) = p_year
  ), entitlement_row AS (
    SELECT he.*
    FROM public.holiday_entitlements he
    WHERE he.user_id IN (v_system_user_id, auth.uid())
      AND he.year = p_year
    ORDER BY CASE WHEN he.user_id = v_system_user_id THEN 0 ELSE 1 END
    LIMIT 1
  )
  SELECT
    er.id AS entitlement_id,
    COALESCE(er.annual_leave_entitlement, COALESCE(su.annual_leave_entitlement, 25)) AS annual_leave_entitlement,
    COALESCE(er.annual_leave_used, 0) AS annual_leave_used,
    COALESCE(er.sick_leave_entitlement, 10) AS sick_leave_entitlement,
    COALESCE(er.sick_leave_used, 0) AS sick_leave_used,
    COALESCE(er.personal_days_entitlement, 5) AS personal_days_entitlement,
    COALESCE(er.personal_days_used, 0) AS personal_days_used,
    COALESCE(er.carried_over, 0) AS carried_over,
    mr.requests_json AS requests
  FROM my_requests mr
  LEFT JOIN entitlement_row er ON true
  LEFT JOIN public.system_users su ON su.id = v_system_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_holiday_request_secure(text, date, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_holiday_request_secure(text, date, date, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_holiday_request_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_holiday_request_secure(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.decline_holiday_request_secure(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_holiday_request_secure(uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_holiday_request_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_holiday_request_secure(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_holiday_overview(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_holiday_overview(integer) TO authenticated;