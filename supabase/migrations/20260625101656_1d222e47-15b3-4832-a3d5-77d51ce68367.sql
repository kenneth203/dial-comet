
CREATE OR REPLACE FUNCTION public.regenerate_all_user_checklists_today()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u RECORD;
  cnt integer := 0;
BEGIN
  DELETE FROM public.checklist_instances ci
  WHERE ci.task_date = CURRENT_DATE
    AND ci.status::text IN ('pending','scheduled','not_started')
    AND NOT EXISTS (
      SELECT 1 FROM public.checklist_logs cl WHERE cl.instance_id = ci.id
    );

  FOR u IN
    SELECT DISTINCT su.user_id
    FROM public.system_users su
    WHERE su.user_id IS NOT NULL
      AND COALESCE(su.status,'active') <> 'inactive'
  LOOP
    BEGIN
      PERFORM public.generate_checklist_for_user(u.user_id, CURRENT_DATE);
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.regenerate_all_user_checklists_today() TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('regenerate-checklists-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'regenerate-checklists-every-5min',
  '*/5 * * * *',
  $$ SELECT public.regenerate_all_user_checklists_today(); $$
);

SELECT public.regenerate_all_user_checklists_today();
