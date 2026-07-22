-- Heartbeat now also flips status to 'online' when the user is logged in.
-- Per product rule: logged in => Online; logout => Offline; otherwise the
-- user must change the status manually (toilet/coffee/meeting persist via
-- their own auto_reset_at timeout and are not overwritten here).
CREATE OR REPLACE FUNCTION public.heartbeat_user_status()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status INTO v_current FROM public.user_statuses WHERE user_id = v_uid;

  IF v_current IS NULL OR v_current = 'offline' THEN
    -- No row yet, or stuck offline despite an active session => flip to online.
    INSERT INTO public.user_statuses (user_id, status, status_emoji, last_heartbeat_at, auto_reset_at)
    VALUES (v_uid, 'online', '✅', now(), NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET status = 'online',
          status_emoji = '✅',
          auto_reset_at = NULL,
          last_heartbeat_at = now(),
          updated_at = now();
  ELSE
    -- Preserve manual transient statuses (toilet/coffee/meeting); just refresh heartbeat.
    UPDATE public.user_statuses
       SET last_heartbeat_at = now(),
           updated_at = now()
     WHERE user_id = v_uid;
  END IF;
END;
$function$;

-- Backfill: any user with a heartbeat in the last 3 minutes is clearly logged
-- in right now; bring them Online so the team view reflects reality.
UPDATE public.user_statuses
   SET status = 'online',
       status_emoji = '✅',
       auto_reset_at = NULL,
       updated_at = now()
 WHERE status = 'offline'
   AND last_heartbeat_at > now() - interval '3 minutes';