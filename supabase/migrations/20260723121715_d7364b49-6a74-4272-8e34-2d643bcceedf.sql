
-- =========================================================================
-- Stage A3: Suspension state machine + reservation infrastructure (DB-only)
-- (Corrected: user_status is a composite type; compare via ::TEXT.)
-- =========================================================================

-- ---------- ENUMS ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.suspension_state AS ENUM
    ('active', 'suspend_pending', 'suspended', 'unsuspend_pending', 'incident');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.suspension_operation AS ENUM ('suspend', 'unsuspend');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.suspension_reservation_status AS ENUM
    ('pending', 'executing', 'completed', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 1. user_suspension_state --------------------------------------
CREATE TABLE IF NOT EXISTS public.user_suspension_state (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state                  public.suspension_state NOT NULL DEFAULT 'active',
  reason                 TEXT,
  actor_user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  active_reservation_id  UUID,
  state_entered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reconciled_at     TIMESTAMPTZ,
  version                BIGINT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON public.user_suspension_state FROM PUBLIC, anon;
GRANT SELECT ON public.user_suspension_state TO authenticated;
GRANT ALL    ON public.user_suspension_state TO service_role;

ALTER TABLE public.user_suspension_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active Super-Admins can view suspension state" ON public.user_suspension_state;
CREATE POLICY "Active Super-Admins can view suspension state"
ON public.user_suspension_state
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role::TEXT   = 'Super-Admin'
      AND p.status::TEXT = 'Active'
  )
);

CREATE INDEX IF NOT EXISTS idx_user_suspension_state_state
  ON public.user_suspension_state(state);

-- ---------- 2. user_suspension_reservation --------------------------------
CREATE TABLE IF NOT EXISTS public.user_suspension_reservation (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation               public.suspension_operation NOT NULL,
  status                  public.suspension_reservation_status NOT NULL DEFAULT 'pending',
  actor_user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role_snapshot     TEXT NOT NULL,
  actor_status_snapshot   TEXT NOT NULL,
  actor_name_snapshot     TEXT,
  target_role_snapshot    TEXT,
  target_state_before     public.suspension_state NOT NULL,
  reason                  TEXT,
  lease_expires_at        TIMESTAMPTZ NOT NULL,
  executing_at            TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  failure_reason          TEXT,
  attempt_count           INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON public.user_suspension_reservation FROM PUBLIC, anon;
GRANT SELECT ON public.user_suspension_reservation TO authenticated;
GRANT ALL    ON public.user_suspension_reservation TO service_role;

ALTER TABLE public.user_suspension_reservation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active Super-Admins can view suspension reservations" ON public.user_suspension_reservation;
CREATE POLICY "Active Super-Admins can view suspension reservations"
ON public.user_suspension_reservation
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role::TEXT   = 'Super-Admin'
      AND p.status::TEXT = 'Active'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_suspension_reservation_live
  ON public.user_suspension_reservation(user_id)
  WHERE status IN ('pending', 'executing');

CREATE INDEX IF NOT EXISTS idx_user_suspension_reservation_status
  ON public.user_suspension_reservation(status, lease_expires_at);

ALTER TABLE public.user_suspension_state
  DROP CONSTRAINT IF EXISTS user_suspension_state_active_reservation_id_fkey;
ALTER TABLE public.user_suspension_state
  ADD CONSTRAINT user_suspension_state_active_reservation_id_fkey
    FOREIGN KEY (active_reservation_id)
    REFERENCES public.user_suspension_reservation(id)
    ON DELETE SET NULL;

-- ---------- 3. user_suspension_audit --------------------------------------
CREATE TABLE IF NOT EXISTS public.user_suspension_audit (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL,
  reservation_id           UUID,
  action                   TEXT NOT NULL,
  from_state               public.suspension_state,
  to_state                 public.suspension_state,
  actor_user_id            UUID,
  actor_role_snapshot      TEXT,
  actor_status_snapshot    TEXT,
  actor_name_snapshot      TEXT,
  details                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON public.user_suspension_audit FROM PUBLIC, anon;
GRANT SELECT ON public.user_suspension_audit TO authenticated;
GRANT ALL    ON public.user_suspension_audit TO service_role;

ALTER TABLE public.user_suspension_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active Super-Admins can view suspension audit" ON public.user_suspension_audit;
CREATE POLICY "Active Super-Admins can view suspension audit"
ON public.user_suspension_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role::TEXT   = 'Super-Admin'
      AND p.status::TEXT = 'Active'
  )
);

CREATE INDEX IF NOT EXISTS idx_user_suspension_audit_user_created
  ON public.user_suspension_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_suspension_audit_reservation
  ON public.user_suspension_audit(reservation_id);

-- ---------- updated_at trigger --------------------------------------------
CREATE OR REPLACE FUNCTION public.suspension_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.suspension_touch_updated_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_user_suspension_state_touch ON public.user_suspension_state;
CREATE TRIGGER trg_user_suspension_state_touch
BEFORE UPDATE ON public.user_suspension_state
FOR EACH ROW EXECUTE FUNCTION public.suspension_touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_suspension_reservation_touch ON public.user_suspension_reservation;
CREATE TRIGGER trg_user_suspension_reservation_touch
BEFORE UPDATE ON public.user_suspension_reservation
FOR EACH ROW EXECUTE FUNCTION public.suspension_touch_updated_at();

-- =========================================================================
-- HELPERS
-- =========================================================================

CREATE OR REPLACE FUNCTION public.count_effective_active_super_admins()
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COUNT(*)::INT
  FROM public.profiles p
  WHERE p.role::TEXT   = 'Super-Admin'
    AND p.status::TEXT = 'Active'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_suspension_reservation r
      WHERE r.user_id = p.user_id
        AND r.operation = 'suspend'
        AND r.status IN ('pending','executing')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_suspension_state s
      WHERE s.user_id = p.user_id
        AND s.state IN ('suspend_pending','suspended','incident')
    );
$$;
REVOKE ALL ON FUNCTION public.count_effective_active_super_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_effective_active_super_admins() TO authenticated, service_role;

-- ---------- reserve_user_suspension (client-callable) ---------------------
CREATE OR REPLACE FUNCTION public.reserve_user_suspension(
  p_target_user_id UUID,
  p_operation      public.suspension_operation,
  p_reason         TEXT,
  p_lease_seconds  INT DEFAULT 300
)
RETURNS TABLE (outcome TEXT, reservation_id UUID, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor_id     UUID := auth.uid();
  v_actor_role   TEXT;
  v_actor_status TEXT;
  v_actor_name   TEXT;
  v_target_role  TEXT;
  v_state        public.suspension_state;
  v_res_id       UUID;
  v_new_state    public.suspension_state;
  v_eff_sa       INT;
BEGIN
  IF p_target_user_id IS NULL OR p_operation IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, NULL::UUID, 'Missing required parameters'::TEXT; RETURN;
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds <= 0 OR p_lease_seconds > 900 THEN
    p_lease_seconds := 300;
  END IF;
  IF v_actor_id IS NULL THEN
    RETURN QUERY SELECT 'unauthorized'::TEXT, NULL::UUID, 'No authenticated user'::TEXT; RETURN;
  END IF;

  SELECT p.role::TEXT, p.status::TEXT, p.name
    INTO v_actor_role, v_actor_status, v_actor_name
  FROM public.profiles p WHERE p.user_id = v_actor_id;

  IF v_actor_role IS NULL OR v_actor_role <> 'Super-Admin' OR v_actor_status <> 'Active' THEN
    RETURN QUERY SELECT 'forbidden'::TEXT, NULL::UUID,
      'Only Active Super-Admins may reserve suspension operations'::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('user_suspension_reservation', 0),
    hashtextextended(p_target_user_id::TEXT, 0)
  );

  SELECT p.role::TEXT INTO v_target_role FROM public.profiles p WHERE p.user_id = p_target_user_id;

  INSERT INTO public.user_suspension_state (user_id, state)
  VALUES (p_target_user_id, 'active')
  ON CONFLICT (user_id) DO NOTHING;

  SELECT s.state INTO v_state FROM public.user_suspension_state s
   WHERE s.user_id = p_target_user_id FOR UPDATE;

  IF v_state = 'incident' THEN
    RETURN QUERY SELECT 'incident'::TEXT, NULL::UUID,
      'Target is in incident state and requires recovery before further operations'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_suspension_reservation r
    WHERE r.user_id = p_target_user_id AND r.status IN ('pending','executing')
  ) THEN
    RETURN QUERY SELECT 'conflict'::TEXT, NULL::UUID,
      'Another suspension operation is already in flight for this user'::TEXT;
    RETURN;
  END IF;

  IF p_operation = 'suspend' THEN
    IF v_state <> 'active' THEN
      RETURN QUERY SELECT 'invalid_transition'::TEXT, NULL::UUID,
        ('Cannot suspend from state ' || v_state::TEXT)::TEXT;
      RETURN;
    END IF;
    v_new_state := 'suspend_pending';
  ELSE
    IF v_state <> 'suspended' THEN
      RETURN QUERY SELECT 'invalid_transition'::TEXT, NULL::UUID,
        ('Cannot unsuspend from state ' || v_state::TEXT)::TEXT;
      RETURN;
    END IF;
    v_new_state := 'unsuspend_pending';
  END IF;

  IF p_operation = 'suspend' AND v_target_role = 'Super-Admin' THEN
    v_eff_sa := public.count_effective_active_super_admins();
    IF v_state = 'active' THEN v_eff_sa := v_eff_sa - 1; END IF;
    IF v_eff_sa < 1 THEN
      RETURN QUERY SELECT 'break_glass_blocked'::TEXT, NULL::UUID,
        'Refusing to suspend the last effective active Super-Admin'::TEXT;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.user_suspension_reservation (
    user_id, operation, status, actor_user_id,
    actor_role_snapshot, actor_status_snapshot, actor_name_snapshot,
    target_role_snapshot, target_state_before, reason, lease_expires_at
  ) VALUES (
    p_target_user_id, p_operation, 'pending', v_actor_id,
    v_actor_role, v_actor_status, v_actor_name,
    v_target_role, v_state, p_reason,
    now() + make_interval(secs => p_lease_seconds)
  )
  RETURNING id INTO v_res_id;

  UPDATE public.user_suspension_state
     SET state = v_new_state, reason = p_reason, actor_user_id = v_actor_id,
         active_reservation_id = v_res_id, state_entered_at = now(),
         version = version + 1
   WHERE user_id = p_target_user_id;

  INSERT INTO public.user_suspension_audit (
    user_id, reservation_id, action, from_state, to_state,
    actor_user_id, actor_role_snapshot, actor_status_snapshot, actor_name_snapshot,
    details
  ) VALUES (
    p_target_user_id, v_res_id, 'reserve', v_state, v_new_state,
    v_actor_id, v_actor_role, v_actor_status, v_actor_name,
    jsonb_build_object('operation', p_operation, 'lease_seconds', p_lease_seconds)
  );

  RETURN QUERY SELECT 'ok'::TEXT, v_res_id, 'Reservation created'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_user_suspension(UUID, public.suspension_operation, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_user_suspension(UUID, public.suspension_operation, TEXT, INT) TO authenticated, service_role;

-- ---------- mark_reservation_executing ------------------------------------
CREATE OR REPLACE FUNCTION public.mark_reservation_executing(p_reservation_id UUID)
RETURNS TABLE (outcome TEXT, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_status public.suspension_reservation_status;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Missing reservation id'::TEXT; RETURN;
  END IF;
  SELECT status INTO v_status FROM public.user_suspension_reservation
   WHERE id = p_reservation_id FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, 'Reservation not found'::TEXT; RETURN;
  END IF;
  IF v_status <> 'pending' THEN
    RETURN QUERY SELECT 'invalid_transition'::TEXT,
      ('Reservation is ' || v_status::TEXT)::TEXT; RETURN;
  END IF;
  UPDATE public.user_suspension_reservation
     SET status='executing', executing_at=now(), attempt_count = attempt_count + 1
   WHERE id = p_reservation_id;
  INSERT INTO public.user_suspension_audit (user_id, reservation_id, action, details)
  SELECT user_id, id, 'execute_start', jsonb_build_object('attempt', attempt_count)
    FROM public.user_suspension_reservation WHERE id = p_reservation_id;
  RETURN QUERY SELECT 'ok'::TEXT, 'Marked executing'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_reservation_executing(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_reservation_executing(UUID) TO service_role;

-- ---------- complete_reservation ------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_reservation(
  p_reservation_id UUID, p_success BOOLEAN, p_failure_reason TEXT DEFAULT NULL
)
RETURNS TABLE (outcome TEXT, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_res public.user_suspension_reservation%ROWTYPE;
  v_new_state public.suspension_state;
BEGIN
  IF p_reservation_id IS NULL OR p_success IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Missing parameters'::TEXT; RETURN;
  END IF;
  SELECT * INTO v_res FROM public.user_suspension_reservation
   WHERE id = p_reservation_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, 'Reservation not found'::TEXT; RETURN;
  END IF;
  IF v_res.status NOT IN ('pending','executing') THEN
    RETURN QUERY SELECT 'invalid_transition'::TEXT,
      ('Reservation already ' || v_res.status::TEXT)::TEXT; RETURN;
  END IF;

  IF p_success THEN
    v_new_state := CASE v_res.operation
      WHEN 'suspend'   THEN 'suspended'::public.suspension_state
      WHEN 'unsuspend' THEN 'active'::public.suspension_state END;
    UPDATE public.user_suspension_reservation
       SET status='completed', completed_at=now() WHERE id=p_reservation_id;
    UPDATE public.user_suspension_state
       SET state=v_new_state, active_reservation_id=NULL,
           state_entered_at=now(), last_reconciled_at=now(),
           version=version+1
     WHERE user_id = v_res.user_id;
    INSERT INTO public.user_suspension_audit (
      user_id, reservation_id, action, from_state, to_state, details
    ) VALUES (
      v_res.user_id, v_res.id, 'complete_success',
      CASE v_res.operation WHEN 'suspend' THEN 'suspend_pending'::public.suspension_state
                           ELSE 'unsuspend_pending'::public.suspension_state END,
      v_new_state, jsonb_build_object('operation', v_res.operation)
    );
  ELSE
    UPDATE public.user_suspension_reservation
       SET status='failed', completed_at=now(), failure_reason=p_failure_reason
     WHERE id=p_reservation_id;
    UPDATE public.user_suspension_state
       SET state=v_res.target_state_before, active_reservation_id=NULL,
           state_entered_at=now(), last_reconciled_at=now(),
           version=version+1
     WHERE user_id = v_res.user_id;
    INSERT INTO public.user_suspension_audit (
      user_id, reservation_id, action, from_state, to_state, details
    ) VALUES (
      v_res.user_id, v_res.id, 'complete_failure',
      CASE v_res.operation WHEN 'suspend' THEN 'suspend_pending'::public.suspension_state
                           ELSE 'unsuspend_pending'::public.suspension_state END,
      v_res.target_state_before,
      jsonb_build_object('failure_reason', p_failure_reason)
    );
  END IF;

  RETURN QUERY SELECT 'ok'::TEXT, 'Completed'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_reservation(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_reservation(UUID, BOOLEAN, TEXT) TO service_role;

-- ---------- expire_stale_reservations -------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_reservations(p_batch_size INT DEFAULT 100)
RETURNS TABLE (expired_count INT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ids UUID[];
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size <= 0 OR p_batch_size > 500 THEN
    p_batch_size := 100;
  END IF;
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.user_suspension_reservation
     WHERE status IN ('pending','executing') AND lease_expires_at < now()
     ORDER BY lease_expires_at LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  ) sub;
  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    RETURN QUERY SELECT 0; RETURN;
  END IF;
  FOR v_rec IN SELECT * FROM public.user_suspension_reservation WHERE id = ANY(v_ids) LOOP
    UPDATE public.user_suspension_reservation
       SET status='expired', completed_at=now(),
           failure_reason=COALESCE(failure_reason,'lease expired')
     WHERE id=v_rec.id;
    UPDATE public.user_suspension_state
       SET state=v_rec.target_state_before, active_reservation_id=NULL,
           state_entered_at=now(), last_reconciled_at=now(),
           version=version+1
     WHERE user_id=v_rec.user_id AND active_reservation_id=v_rec.id;
    INSERT INTO public.user_suspension_audit (
      user_id, reservation_id, action, from_state, to_state, details
    ) VALUES (
      v_rec.user_id, v_rec.id, 'expire',
      CASE v_rec.operation WHEN 'suspend' THEN 'suspend_pending'::public.suspension_state
                           ELSE 'unsuspend_pending'::public.suspension_state END,
      v_rec.target_state_before,
      jsonb_build_object('lease_expires_at', v_rec.lease_expires_at)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN QUERY SELECT v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_stale_reservations(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_reservations(INT) TO service_role;

-- ---------- flag_suspension_incident --------------------------------------
CREATE OR REPLACE FUNCTION public.flag_suspension_incident(p_user_id UUID, p_reason TEXT)
RETURNS TABLE (outcome TEXT, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_prev public.suspension_state;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Missing user id'::TEXT; RETURN;
  END IF;
  INSERT INTO public.user_suspension_state (user_id, state)
  VALUES (p_user_id, 'incident')
  ON CONFLICT (user_id) DO NOTHING;
  SELECT state INTO v_prev FROM public.user_suspension_state
   WHERE user_id=p_user_id FOR UPDATE;
  UPDATE public.user_suspension_state
     SET state='incident', reason=p_reason, state_entered_at=now(),
         last_reconciled_at=now(), version=version+1
   WHERE user_id=p_user_id;
  INSERT INTO public.user_suspension_audit (user_id, action, from_state, to_state, details)
  VALUES (p_user_id, 'incident_flag', v_prev, 'incident', jsonb_build_object('reason', p_reason));
  RETURN QUERY SELECT 'ok'::TEXT, 'Flagged as incident'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.flag_suspension_incident(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_suspension_incident(UUID, TEXT) TO service_role;

-- ---------- recover_suspension_incident -----------------------------------
CREATE OR REPLACE FUNCTION public.recover_suspension_incident(
  p_user_id UUID, p_target_state public.suspension_state, p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (outcome TEXT, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_prev public.suspension_state;
BEGIN
  IF p_user_id IS NULL OR p_target_state IS NULL THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Missing parameters'::TEXT; RETURN;
  END IF;
  IF p_target_state NOT IN ('active','suspended') THEN
    RETURN QUERY SELECT 'error'::TEXT, 'Recovery target must be active or suspended'::TEXT; RETURN;
  END IF;
  SELECT state INTO v_prev FROM public.user_suspension_state
   WHERE user_id=p_user_id FOR UPDATE;
  IF v_prev IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, 'No state row for user'::TEXT; RETURN;
  END IF;
  IF v_prev <> 'incident' THEN
    RETURN QUERY SELECT 'invalid_transition'::TEXT,
      ('User is not in incident state (currently ' || v_prev::TEXT || ')')::TEXT; RETURN;
  END IF;
  UPDATE public.user_suspension_state
     SET state=p_target_state, reason=p_reason, state_entered_at=now(),
         last_reconciled_at=now(), version=version+1
   WHERE user_id=p_user_id;
  INSERT INTO public.user_suspension_audit (user_id, action, from_state, to_state, details)
  VALUES (p_user_id, 'incident_recover', 'incident', p_target_state,
          jsonb_build_object('reason', p_reason));
  RETURN QUERY SELECT 'ok'::TEXT, 'Recovered from incident'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_suspension_incident(UUID, public.suspension_state, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_suspension_incident(UUID, public.suspension_state, TEXT) TO service_role;
