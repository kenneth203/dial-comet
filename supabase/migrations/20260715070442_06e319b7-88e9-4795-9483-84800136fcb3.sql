
CREATE OR REPLACE FUNCTION public.generate_checklist_for_all_users(p_date date DEFAULT ((now() AT TIME ZONE 'Europe/London'::text))::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u record;
  n integer := 0;
BEGIN
  FOR u IN
    SELECT DISTINCT su.user_id
    FROM public.system_users su
    WHERE su.user_id IS NOT NULL
      AND COALESCE(su.status, 'active') = 'active'
  LOOP
    BEGIN
      PERFORM public.generate_checklist_for_user(u.user_id, p_date);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- swallow per-user errors so one bad row does not stop the batch
      NULL;
    END;
  END LOOP;
  RETURN n;
END;
$function$;
