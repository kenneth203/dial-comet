
-- 1. Add heartbeat column
ALTER TABLE public.user_statuses
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_statuses_last_heartbeat
  ON public.user_statuses (last_heartbeat_at)
  WHERE status <> 'offline';

-- 2. Heartbeat RPC — called by signed-in clients every ~60s
CREATE OR REPLACE FUNCTION public.heartbeat_user_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_statuses (user_id, status, status_emoji, last_heartbeat_at)
  VALUES (v_uid, 'online', '🟢', now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_heartbeat_at = now(),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_user_status() TO authenticated;

-- 3. Sweep stale users to offline (no heartbeat in > 3 minutes)
CREATE OR REPLACE FUNCTION public.mark_stale_users_offline()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.user_statuses
       SET status = 'offline',
           status_emoji = '⛔',
           auto_reset_at = NULL,
           updated_at = now()
     WHERE status <> 'offline'
       AND last_heartbeat_at < (now() - interval '3 minutes')
     RETURNING user_id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_stale_users_offline() TO service_role;

-- 4. Schedule the sweep every minute via pg_cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-stale-users-offline') THEN
    PERFORM cron.unschedule('mark-stale-users-offline');
  END IF;
  PERFORM cron.schedule(
    'mark-stale-users-offline',
    '* * * * *',
    $cron$ SELECT public.mark_stale_users_offline(); $cron$
  );
END $$;
