-- Track unpaid sick/compassionate leave without losing the original absence type.
-- This lets the "Off Sick Today" dashboard card show an Unpaid badge while still
-- displaying the entry under sick leave.

ALTER TABLE public.holiday_requests ADD COLUMN IF NOT EXISTS is_unpaid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.holiday_requests_archive ADD COLUMN IF NOT EXISTS is_unpaid BOOLEAN NOT NULL DEFAULT false;

-- Update simple one-argument approval function to explicitly stamp is_unpaid = false.
CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  SET status='approved'::request_status,
      approved_by=auth.uid(),
      approved_at=now(),
      is_unpaid=false,
      decline_reason=NULL,
      updated_at=now()
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
END;
$$;

-- Update override version: KEEP the original absence_type (sick/compassionate) and just flag is_unpaid.
-- This ensures converted sick days still appear on the "Off Sick Today" card.
CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(p_request_id uuid, p_override boolean DEFAULT false, p_convert_to_unpaid boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  req RECORD; v_days numeric; v_year int;
  v_default_annual numeric := 25.0;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'For security reasons, you cannot call this function.';
  END IF;

  IF (p_override OR p_convert_to_unpaid) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only Super-Admin can override allocation or convert to unpaid leave';
  END IF;

  SELECT * INTO req FROM public.holiday_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Holiday request not found'; END IF;
  IF req.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be approved';
  END IF;

  IF (p_override OR p_convert_to_unpaid)
     AND req.absence_type NOT IN ('sick_leave','compassionate_leave') THEN
    RAISE EXCEPTION 'Override/convert is only allowed for Sick Leave or Compassionate Leave';
  END IF;

  v_days := COALESCE(req.total_days, public.calculate_working_days(req.start_date, req.end_date));
  v_year := EXTRACT(YEAR FROM req.start_date)::int;

  UPDATE public.holiday_requests
  SET status='approved'::request_status,
      approved_by=auth.uid(),
      approved_at=now(),
      is_unpaid = p_convert_to_unpaid,
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

  -- Do not deduct any leave bucket when converted to unpaid.
  IF NOT p_convert_to_unpaid THEN
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
  END IF;

  RETURN to_jsonb((SELECT hr FROM public.holiday_requests hr WHERE hr.id = p_request_id));
END;
$$;

-- Expose is_unpaid in today's holiday/sick dashboard lookup.
DROP FUNCTION IF EXISTS public.get_users_on_holiday_today();
CREATE OR REPLACE FUNCTION public.get_users_on_holiday_today()
RETURNS TABLE (
  request_id uuid,
  user_id uuid,
  system_user_id uuid,
  name text,
  absence_type text,
  start_date date,
  end_date date,
  is_unpaid boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    hr.id AS request_id,
    hr.user_id,
    hr.system_user_id,
    COALESCE(su.name, 'Team Member') AS name,
    hr.absence_type::text,
    hr.start_date,
    hr.end_date,
    hr.is_unpaid
  FROM public.holiday_requests hr
  LEFT JOIN public.system_users su
    ON su.id = hr.system_user_id
    OR su.user_id = hr.user_id
  WHERE hr.status = 'approved'
    AND CURRENT_DATE BETWEEN hr.start_date AND hr.end_date
  ORDER BY su.name NULLS LAST;
$$;

-- Backfill existing approved unpaid_leave records that were previously converted from sick/compassionate leave.
-- We cannot reliably know whether the original type was sick or compassionate, so we default to sick_leave
-- to match the "Off Sick Today" dashboard card you asked about.
UPDATE public.holiday_requests
SET absence_type = 'sick_leave',
    is_unpaid = true,
    updated_at = now()
WHERE absence_type = 'unpaid_leave'
  AND status = 'approved'
  AND COALESCE(reason,'') ILIKE '%Converted to Unpaid Leave%';

UPDATE public.holiday_requests_archive
SET absence_type = 'sick_leave',
    is_unpaid = true,
    updated_at = now()
WHERE absence_type = 'unpaid_leave'
  AND COALESCE(reason,'') ILIKE '%Converted to Unpaid Leave%';