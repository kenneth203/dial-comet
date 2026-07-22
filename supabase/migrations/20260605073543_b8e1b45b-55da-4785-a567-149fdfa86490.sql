CREATE OR REPLACE FUNCTION public.send_checklist_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
  v_due_ts timestamptz;
  v_minutes integer;
BEGIN
  FOR r IN
    SELECT ci.id, ci.user_id, ci.title, ci.task_date, ci.due_time,
           ct.reminder_offset_minutes
    FROM public.checklist_instances ci
    JOIN public.checklist_templates ct ON ct.id = ci.template_id
    WHERE ci.status = 'not_started'
      AND ci.reminder_sent_at IS NULL
      AND ci.due_time IS NOT NULL
      AND ct.reminder_offset_minutes IS NOT NULL
      AND ct.reminder_offset_minutes > 0
      AND (ci.task_date + ci.due_time) > now()
      AND (ci.task_date + ci.due_time) <= now() + make_interval(mins => ct.reminder_offset_minutes)
  LOOP
    v_due_ts := r.task_date + r.due_time;
    v_minutes := GREATEST(1, EXTRACT(EPOCH FROM (v_due_ts - now()))::int / 60);

    PERFORM public.create_task_notification(
      r.user_id,
      NULL,
      'Checklist reminder: "' || r.title || '" is due in ~' || v_minutes || ' min',
      'checklist_reminder',
      r.id
    );

    UPDATE public.checklist_instances
       SET reminder_sent_at = now()
     WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.send_checklist_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_checklist_reminders() TO service_role;