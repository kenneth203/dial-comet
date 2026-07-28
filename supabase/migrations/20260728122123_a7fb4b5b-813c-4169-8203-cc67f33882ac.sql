-- 1. Authorisation predicate mirroring reserve_user_suspension's actor check
CREATE OR REPLACE FUNCTION public.can_manage_user_suspension()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role::TEXT = 'Super-Admin'
      AND p.status = 'Active'::public.profile_status
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_user_suspension() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_user_suspension() TO authenticated, service_role;

-- 2. Idempotent expiry reconciliation (no cron required)
CREATE OR REPLACE FUNCTION public.reconcile_expired_suspensions(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(reconciled_count integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;

  -- Self-reconciliation, or any user when the actor is an Active Super-Admin.
  IF p_user_id IS DISTINCT FROM v_actor AND NOT public.can_manage_user_suspension() THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;

  FOR v_rec IN
    SELECT s.user_id, s.suspend_until, s.reason
    FROM public.user_suspension_state s
    WHERE s.state = 'suspended'::public.suspension_state
      AND s.suspend_until IS NOT NULL
      AND s.suspend_until <= now()
      AND (p_user_id IS NULL OR s.user_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_suspension_reservation r
        WHERE r.user_id = s.user_id AND r.status IN ('pending','executing')
      )
    FOR UPDATE
  LOOP
    UPDATE public.user_suspension_state
       SET state = 'active'::public.suspension_state,
           suspend_until = NULL,
           reason = NULL,
           active_reservation_id = NULL,
           state_entered_at = now(),
           last_reconciled_at = now(),
           version = version + 1
     WHERE user_id = v_rec.user_id
       AND state = 'suspended'::public.suspension_state;

    UPDATE public.profiles
       SET status = 'Active'::public.profile_status
     WHERE user_id = v_rec.user_id
       AND status = 'Suspended'::public.profile_status;

    INSERT INTO public.user_suspension_audit (
      user_id, reservation_id, action, from_state, to_state, details
    ) VALUES (
      v_rec.user_id, NULL, 'expire_timed',
      'suspended'::public.suspension_state,
      'active'::public.suspension_state,
      jsonb_build_object('suspend_until', v_rec.suspend_until, 'reason', v_rec.reason)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_expired_suspensions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_expired_suspensions(uuid) TO authenticated, service_role;

-- 3. Self status check: reconcile own expiry first, then report effective status
DROP FUNCTION IF EXISTS public.get_my_suspension_status();
CREATE OR REPLACE FUNCTION public.get_my_suspension_status()
RETURNS TABLE(
  state public.suspension_state,
  reason text,
  state_entered_at timestamptz,
  suspend_until timestamptz,
  is_suspended boolean,
  effective_status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  PERFORM public.reconcile_expired_suspensions(v_uid);

  RETURN QUERY
  SELECT
    COALESCE(s.state, 'active'::public.suspension_state),
    s.reason,
    s.state_entered_at,
    s.suspend_until,
    COALESCE(
      s.state = 'suspended'::public.suspension_state
        AND (s.suspend_until IS NULL OR s.suspend_until > now()),
      false
    ),
    CASE
      WHEN s.state IS NULL OR s.state = 'active'::public.suspension_state THEN 'active'
      WHEN s.state = 'incident'::public.suspension_state THEN 'incident'
      WHEN s.state IN ('suspend_pending'::public.suspension_state, 'unsuspend_pending'::public.suspension_state)
        THEN s.state::TEXT
      WHEN s.state = 'suspended'::public.suspension_state AND s.suspend_until IS NULL THEN 'suspended'
      WHEN s.state = 'suspended'::public.suspension_state AND s.suspend_until > now() THEN 'timed_suspended'
      ELSE 'expired'
    END::TEXT
  FROM (SELECT v_uid AS uid) me
  LEFT JOIN public.user_suspension_state s ON s.user_id = me.uid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_suspension_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_suspension_status() TO authenticated, service_role;

-- 4. Administrator overview: reconcile expiries, expose effective status
DROP FUNCTION IF EXISTS public.get_user_suspension_overview();
CREATE OR REPLACE FUNCTION public.get_user_suspension_overview()
RETURNS TABLE(
  user_id uuid,
  state public.suspension_state,
  reason text,
  state_entered_at timestamptz,
  suspend_until timestamptz,
  actor_user_id uuid,
  actor_name text,
  is_suspended boolean,
  effective_status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.status = 'Active'::public.profile_status
      AND p.role::TEXT IN ('Admin','Super-Admin')
  ) THEN
    RETURN;
  END IF;

  IF public.can_manage_user_suspension() THEN
    PERFORM public.reconcile_expired_suspensions(NULL);
  END IF;

  RETURN QUERY
  SELECT s.user_id,
         s.state,
         s.reason,
         s.state_entered_at,
         s.suspend_until,
         s.actor_user_id,
         ap.name,
         (s.state IN ('suspended'::public.suspension_state, 'suspend_pending'::public.suspension_state)
          AND (s.suspend_until IS NULL OR s.suspend_until > now())),
         CASE
           WHEN s.state = 'active'::public.suspension_state THEN 'active'
           WHEN s.state = 'incident'::public.suspension_state THEN 'incident'
           WHEN s.state IN ('suspend_pending'::public.suspension_state, 'unsuspend_pending'::public.suspension_state)
             THEN s.state::TEXT
           WHEN s.state = 'suspended'::public.suspension_state AND s.suspend_until IS NULL THEN 'suspended'
           WHEN s.state = 'suspended'::public.suspension_state AND s.suspend_until > now() THEN 'timed_suspended'
           ELSE 'expired'
         END::TEXT
  FROM public.user_suspension_state s
  LEFT JOIN public.profiles ap ON ap.user_id = s.actor_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_suspension_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_suspension_overview() TO authenticated, service_role;