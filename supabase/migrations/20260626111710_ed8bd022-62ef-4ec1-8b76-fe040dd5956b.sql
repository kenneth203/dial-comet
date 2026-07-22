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
        updated_at = now();
END;
$function$;