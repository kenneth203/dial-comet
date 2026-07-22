
-- Replace the approval function to reconcile IDs and approve securely
CREATE OR REPLACE FUNCTION public.approve_holiday_request_secure(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  req RECORD;
  sys_user RECORD;
  requester_is_admin boolean;
  anomaly_type text;
BEGIN
  -- Require admin/supervisor
  requester_is_admin := public.is_admin_or_higher();
  IF NOT requester_is_admin THEN
    RAISE EXCEPTION 'For security reasons, you cannot call this function.';
  END IF;

  -- Lock and load the holiday request
  SELECT * INTO req
  FROM public.holiday_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Holiday request not found';
  END IF;

  -- Only approve pending requests
  IF req.status <> 'pending'::request_status THEN
    RAISE EXCEPTION 'Only pending requests can be approved';
  END IF;

  -- Try to reconcile user_id and system_user_id
  IF req.system_user_id IS NOT NULL THEN
    SELECT su.* INTO sys_user
    FROM public.system_users su
    WHERE su.id = req.system_user_id
    LIMIT 1;

    IF sys_user.id IS NOT NULL THEN
      -- If user_id is missing or mismatched, align it with system_users.user_id
      IF req.user_id IS NULL OR req.user_id <> sys_user.user_id THEN
        anomaly_type := 'MISMATCH_user_id_vs_system_user_id';

        -- Log the anomaly for visibility
        INSERT INTO public.holiday_data_anomalies (
          request_id,
          request_user_id,
          system_user_id,
          system_user_auth_id,
          start_date,
          end_date,
          status,
          system_user_name,
          anomaly_type
        ) VALUES (
          req.id,
          req.user_id,
          req.system_user_id,
          sys_user.user_id,
          req.start_date,
          req.end_date,
          req.status,
          sys_user.name,
          anomaly_type
        );

        -- Backfill/align the user_id from system_users
        UPDATE public.holiday_requests
        SET user_id = sys_user.user_id
        WHERE id = p_request_id;

        -- Refresh req.user_id for subsequent logic
        req.user_id := sys_user.user_id;
      END IF;
    END IF;

  ELSIF req.user_id IS NOT NULL THEN
    -- If system_user_id is missing, try to populate from system_users
    SELECT su.* INTO sys_user
    FROM public.system_users su
    WHERE su.user_id = req.user_id
    LIMIT 1;

    IF sys_user.id IS NOT NULL AND (req.system_user_id IS NULL OR req.system_user_id <> sys_user.id) THEN
      anomaly_type := 'BACKFILL_system_user_id_from_user_id';

      INSERT INTO public.holiday_data_anomalies (
        request_id,
        request_user_id,
        system_user_id,
        system_user_auth_id,
        start_date,
        end_date,
        status,
        system_user_name,
        anomaly_type
      ) VALUES (
        req.id,
        req.user_id,
        sys_user.id,
        sys_user.user_id,
        req.start_date,
        req.end_date,
        req.status,
        sys_user.name,
        anomaly_type
      );

      UPDATE public.holiday_requests
      SET system_user_id = sys_user.id
      WHERE id = p_request_id;

      req.system_user_id := sys_user.id;
    END IF;
  END IF;

  -- Final approval update
  UPDATE public.holiday_requests
  SET
    status = 'approved'::request_status,
    approved_by = auth.uid(),
    approved_at = now(),
    decline_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  -- Return the updated row for client confirmation
  RETURN to_jsonb((
    SELECT hr FROM public.holiday_requests hr WHERE hr.id = p_request_id
  ));
END;
$$;

-- Ensure only authenticated clients can execute (anon cannot)
REVOKE ALL ON FUNCTION public.approve_holiday_request_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_holiday_request_secure(uuid) TO authenticated;
