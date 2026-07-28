
-- USR-006: administrator suspension controls (app-layer, no auth banning)

CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_target_user_id UUID,
  p_reason TEXT,
  p_suspend_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(outcome TEXT, message TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_res_id UUID;
  v_outcome TEXT;
  v_message TEXT;
  v_c_outcome TEXT;
  v_c_message TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN QUERY SELECT 'unauthorized'::TEXT, 'No authenticated user'::TEXT; RETURN;
  END IF;
  IF p_target_user_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Missing target user'::TEXT; RETURN;
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN QUERY SELECT 'error'::TEXT, 'A suspension reason is required'::TEXT; RETURN;
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Reason must be 500 characters or fewer'::TEXT; RETURN;
  END IF;
  IF p_target_user_id = v_actor THEN
    RETURN QUERY SELECT 'forbidden'::TEXT, 'You cannot suspend your own account'::TEXT; RETURN;
  END IF;
  IF p_suspend_until IS NOT NULL AND p_suspend_until <= now() THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Scheduled end date must be in the future'::TEXT; RETURN;
  END IF;

  SELECT r.outcome, r.reservation_id, r.message
    INTO v_outcome, v_res_id, v_message
  FROM public.reserve_user_suspension(
    p_target_user_id, 'suspend'::public.suspension_operation, btrim(p_reason), 300
  ) r;

  IF v_outcome <> 'ok' THEN
    RETURN QUERY SELECT v_outcome, v_message; RETURN;
  END IF;

  PERFORM public.mark_reservation_executing(v_res_id);

  SELECT c.outcome, c.message INTO v_c_outcome, v_c_message
  FROM public.complete_reservation(v_res_id, TRUE, NULL) c;

  IF v_c_outcome <> 'ok' THEN
    RETURN QUERY SELECT v_c_outcome, v_c_message; RETURN;
  END IF;

  UPDATE public.user_suspension_state
     SET suspend_until = p_suspend_until
   WHERE user_id = p_target_user_id;

  UPDATE public.profiles
     SET status = 'Suspended'::public.profile_status
   WHERE user_id = p_target_user_id;

  RETURN QUERY SELECT 'ok'::TEXT, 'User suspended'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reinstate_user(
  p_target_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(outcome TEXT, message TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_res_id UUID;
  v_outcome TEXT;
  v_message TEXT;
  v_c_outcome TEXT;
  v_c_message TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN QUERY SELECT 'unauthorized'::TEXT, 'No authenticated user'::TEXT; RETURN;
  END IF;
  IF p_target_user_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Missing target user'::TEXT; RETURN;
  END IF;
  IF p_reason IS NOT NULL AND length(btrim(p_reason)) > 500 THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Reason must be 500 characters or fewer'::TEXT; RETURN;
  END IF;

  SELECT r.outcome, r.reservation_id, r.message
    INTO v_outcome, v_res_id, v_message
  FROM public.reserve_user_suspension(
    p_target_user_id, 'unsuspend'::public.suspension_operation, NULLIF(btrim(COALESCE(p_reason,'')), ''), 300
  ) r;

  IF v_outcome <> 'ok' THEN
    RETURN QUERY SELECT v_outcome, v_message; RETURN;
  END IF;

  PERFORM public.mark_reservation_executing(v_res_id);

  SELECT c.outcome, c.message INTO v_c_outcome, v_c_message
  FROM public.complete_reservation(v_res_id, TRUE, NULL) c;

  IF v_c_outcome <> 'ok' THEN
    RETURN QUERY SELECT v_c_outcome, v_c_message; RETURN;
  END IF;

  UPDATE public.user_suspension_state
     SET suspend_until = NULL, reason = NULL
   WHERE user_id = p_target_user_id;

  UPDATE public.profiles
     SET status = 'Active'::public.profile_status
   WHERE user_id = p_target_user_id
     AND status = 'Suspended'::public.profile_status;

  RETURN QUERY SELECT 'ok'::TEXT, 'User reinstated'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_suspension_overview()
RETURNS TABLE(
  user_id UUID,
  state public.suspension_state,
  reason TEXT,
  state_entered_at TIMESTAMPTZ,
  suspend_until TIMESTAMPTZ,
  actor_user_id UUID,
  actor_name TEXT,
  is_suspended BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id,
         s.state,
         s.reason,
         s.state_entered_at,
         s.suspend_until,
         s.actor_user_id,
         ap.name,
         (s.state IN ('suspended','suspend_pending')
          AND (s.suspend_until IS NULL OR s.suspend_until > now())) AS is_suspended
  FROM public.user_suspension_state s
  LEFT JOIN public.profiles ap ON ap.user_id = s.actor_user_id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.status = 'Active'::public.profile_status
      AND p.role::TEXT IN ('Admin','Super-Admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_suspension_history(p_target_user_id UUID)
RETURNS TABLE(
  id UUID,
  action TEXT,
  from_state public.suspension_state,
  to_state public.suspension_state,
  reason TEXT,
  actor_name TEXT,
  suspend_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id,
         a.action,
         a.from_state,
         a.to_state,
         COALESCE(r.reason, a.details->>'reason'),
         COALESCE(a.actor_name_snapshot, r.actor_name_snapshot, ap.name),
         s.suspend_until,
         a.created_at
  FROM public.user_suspension_audit a
  LEFT JOIN public.user_suspension_reservation r ON r.id = a.reservation_id
  LEFT JOIN public.profiles ap ON ap.user_id = a.actor_user_id
  LEFT JOIN public.user_suspension_state s ON s.user_id = a.user_id
  WHERE a.user_id = p_target_user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.status = 'Active'::public.profile_status
        AND p.role::TEXT IN ('Admin','Super-Admin')
    )
  ORDER BY a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_suspend_user(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reinstate_user(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_suspension_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_suspension_history(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reinstate_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_suspension_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_suspension_history(UUID) TO authenticated;
