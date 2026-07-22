
CREATE OR REPLACE FUNCTION public.mark_self_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_statuses (user_id, status, status_emoji, auto_reset_at)
  VALUES (v_uid, 'offline', '⛔', NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'offline',
        status_emoji = '⛔',
        auto_reset_at = NULL,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_self_offline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_self_offline() TO authenticated, service_role;
