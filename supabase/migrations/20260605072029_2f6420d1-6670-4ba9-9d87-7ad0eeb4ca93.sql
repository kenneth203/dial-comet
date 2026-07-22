CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.generate_checklist_for_all_users(p_date date DEFAULT (now() AT TIME ZONE 'Europe/London')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE
AS $$
DECLARE
  u record;
  n integer := 0;
BEGIN
  FOR u IN
    SELECT DISTINCT su.auth_user_id
    FROM public.system_users su
    WHERE su.auth_user_id IS NOT NULL
      AND COALESCE(su.is_active, true) = true
  LOOP
    BEGIN
      PERFORM public.generate_checklist_for_user(u.auth_user_id, p_date);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- swallow per-user errors so one bad row does not stop the batch
      NULL;
    END;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_checklist_for_all_users(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_checklist_for_all_users(date) TO service_role;