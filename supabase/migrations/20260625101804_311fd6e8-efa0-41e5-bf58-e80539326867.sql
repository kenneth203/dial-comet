
CREATE OR REPLACE FUNCTION public.heartbeat_user_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        status = CASE WHEN public.user_statuses.status = 'offline' THEN 'online' ELSE public.user_statuses.status END,
        status_emoji = CASE WHEN public.user_statuses.status = 'offline' THEN '🟢' ELSE public.user_statuses.status_emoji END,
        updated_at = now();
END;
$function$;

-- Restore anyone currently stuck Offline but whose heartbeat is fresh (<3 min)
UPDATE public.user_statuses
   SET status = 'online',
       status_emoji = '🟢',
       updated_at = now()
 WHERE status = 'offline'
   AND last_heartbeat_at > (now() - interval '3 minutes');
