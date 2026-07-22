-- Restore create_holiday_request_secure (was missing from schema)
DROP FUNCTION IF EXISTS public.create_holiday_request_secure(text, date, date, text, uuid);

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
  overlapping_count integer;
  new_request_id uuid;
BEGIN
  IF p_target_user_id IS NOT NULL AND is_admin_or_higher() THEN
    SELECT su.user_id, su.id INTO target_user_id, target_system_user_id
    FROM public.system_users su
    WHERE su.id = p_target_user_id
    LIMIT 1;

    IF target_system_user_id IS NULL THEN
      RAISE EXCEPTION 'System user not found for the given ID';
    END IF;
  ELSE
    target_user_id := auth.uid();
    SELECT id INTO target_system_user_id
    FROM public.system_users
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Start date must be before or equal to end date';
  END IF;

  IF p_start_date < CURRENT_DATE AND p_absence_type != 'sick_leave' AND NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Cannot create holiday requests for past dates';
  END IF;

  calculated_days := calculate_working_days(p_start_date, p_end_date);

  IF target_system_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO overlapping_count
    FROM public.holiday_requests
    WHERE system_user_id = target_system_user_id
      AND status IN ('pending', 'approved')
      AND (
        (p_start_date BETWEEN start_date AND end_date) OR
        (p_end_date BETWEEN start_date AND end_date) OR
        (start_date BETWEEN p_start_date AND p_end_date)
      );
  ELSIF target_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO overlapping_count
    FROM public.holiday_requests
    WHERE user_id = target_user_id
      AND status IN ('pending', 'approved')
      AND (
        (p_start_date BETWEEN start_date AND end_date) OR
        (p_end_date BETWEEN start_date AND end_date) OR
        (start_date BETWEEN p_start_date AND p_end_date)
      );
  END IF;

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
    status
  ) VALUES (
    target_user_id,
    target_system_user_id,
    p_absence_type::absence_type,
    p_start_date,
    p_end_date,
    calculated_days,
    p_reason,
    'pending'
  ) RETURNING id INTO new_request_id;

  RETURN new_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_holiday_request_secure(text, date, date, text, uuid) TO authenticated;