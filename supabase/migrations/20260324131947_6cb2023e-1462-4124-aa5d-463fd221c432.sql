CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  req RECORD;
  sys_user RECORD;
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

  -- Reconcile user_id and system_user_id
  IF req.system_user_id IS NOT NULL THEN
    SELECT su.* INTO sys_user
    FROM public.system_users su
    WHERE su.id = req.system_user_id
    LIMIT 1;

    IF sys_user.id IS NOT NULL AND (req.user_id IS NULL OR req.user_id <> sys_user.user_id) THEN
      UPDATE public.holiday_requests
      SET user_id = sys_user.user_id
      WHERE id = p_request_id;
      req.user_id := sys_user.user_id;
    END IF;

  ELSIF req.user_id IS NOT NULL THEN
    SELECT su.* INTO sys_user
    FROM public.system_users su
    WHERE su.user_id = req.user_id
    LIMIT 1;

    IF sys_user.id IS NOT NULL AND (req.system_user_id IS NULL OR req.system_user_id <> sys_user.id) THEN
      UPDATE public.holiday_requests
      SET system_user_id = sys_user.id
      WHERE id = p_request_id;
      req.system_user_id := sys_user.id;
    END IF;
  END IF;

  -- Final approval
  UPDATE public.holiday_requests
  SET
    status = 'approved'::request_status,
    approved_by = auth.uid(),
    approved_at = now(),
    decline_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  RETURN to_jsonb((
    SELECT hr FROM public.holiday_requests hr WHERE hr.id = p_request_id
  ));
END;
$function$;