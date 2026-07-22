CREATE OR REPLACE FUNCTION public.create_task_notification(
  p_recipient_id uuid,
  p_task_id uuid,
  p_message text,
  p_type text DEFAULT 'task_assigned'::text,
  p_related_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_checklist public.checklist_instances%ROWTYPE;
BEGIN
  IF p_recipient_id IS NULL OR p_message IS NULL OR p_type IS NULL THEN
    RAISE EXCEPTION 'recipient, message and type are required';
  END IF;

  IF COALESCE(p_type, '') = 'checklist_reminder' THEN
    IF p_related_id IS NULL THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'missing_checklist_reference');
    END IF;

    SELECT * INTO v_checklist
    FROM public.checklist_instances
    WHERE id = p_related_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'checklist_missing');
    END IF;

    IF v_checklist.status IN ('completed', 'skipped', 'not_applicable') THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'checklist_closed');
    END IF;

    IF v_checklist.due_time IS NOT NULL
       AND (v_checklist.task_date + v_checklist.due_time) <= now() THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'checklist_due_passed');
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.task_notifications tn
      WHERE tn.user_id = p_recipient_id
        AND tn.type = 'checklist_reminder'
        AND tn.created_at::date = v_checklist.task_date
        AND (
          tn.related_id = p_related_id
          OR tn.message LIKE ('Checklist reminder: "' || replace(v_checklist.title, '%', '\%') || '"%') ESCAPE '\'
        )
    ) THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'duplicate_checklist_reminder');
    END IF;
  END IF;

  INSERT INTO public.task_notifications (user_id, task_id, message, type, related_id)
  VALUES (p_recipient_id, p_task_id, p_message, p_type, p_related_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_notification(uuid, uuid, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_checklist_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.task_notifications tn
        WHERE tn.user_id = ci.user_id
          AND tn.type = 'checklist_reminder'
          AND tn.created_at::date = ci.task_date
          AND (
            tn.related_id = ci.id
            OR tn.message LIKE ('Checklist reminder: "' || replace(ci.title, '%', '\%') || '"%') ESCAPE '\'
          )
      )
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_checklist_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_checklist_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.clear_finished_task_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_TABLE_NAME = 'checklist_instances'
     AND NEW.status IN ('completed', 'skipped', 'not_applicable') THEN
    UPDATE public.task_notifications
       SET is_read = true
     WHERE is_read = false
       AND (related_id = NEW.id OR task_id = NEW.id);
  ELSIF TG_TABLE_NAME = 'project_tasks'
        AND NEW.status = 'completed'
        AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN
    UPDATE public.task_notifications
       SET is_read = true
     WHERE is_read = false
       AND task_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'todos'
        AND COALESCE(NEW.completed, false) = true
        AND COALESCE(OLD.completed, false) IS DISTINCT FROM true THEN
    UPDATE public.task_notifications
       SET is_read = true
     WHERE is_read = false
       AND task_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_checklist_finished_notifications ON public.checklist_instances;
CREATE TRIGGER trg_clear_checklist_finished_notifications
AFTER UPDATE OF status ON public.checklist_instances
FOR EACH ROW
WHEN (NEW.status IN ('completed', 'skipped', 'not_applicable'))
EXECUTE FUNCTION public.clear_finished_task_notifications();

DROP TRIGGER IF EXISTS trg_clear_project_task_finished_notifications ON public.project_tasks;
CREATE TRIGGER trg_clear_project_task_finished_notifications
AFTER UPDATE OF status ON public.project_tasks
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION public.clear_finished_task_notifications();

DROP TRIGGER IF EXISTS trg_clear_todo_finished_notifications ON public.todos;
CREATE TRIGGER trg_clear_todo_finished_notifications
AFTER UPDATE OF completed ON public.todos
FOR EACH ROW
WHEN (NEW.completed = true)
EXECUTE FUNCTION public.clear_finished_task_notifications();

DELETE FROM public.task_notifications n
WHERE n.type = 'checklist_reminder'
  AND (
    n.related_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.checklist_instances ci
      WHERE ci.id = n.related_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.checklist_instances ci
      WHERE ci.id = n.related_id
        AND (
          ci.status IN ('completed', 'skipped', 'not_applicable')
          OR (ci.due_time IS NOT NULL AND (ci.task_date + ci.due_time) <= now())
        )
    )
  );

DELETE FROM public.task_notifications n
WHERE EXISTS (
    SELECT 1 FROM public.project_tasks pt
    WHERE pt.id = n.task_id AND pt.status = 'completed'
  )
  OR EXISTS (
    SELECT 1 FROM public.todos t
    WHERE t.id = n.task_id AND COALESCE(t.completed, false) = true
  )
  OR EXISTS (
    SELECT 1 FROM public.checklist_instances ci
    WHERE ci.id = n.task_id AND ci.status IN ('completed', 'skipped', 'not_applicable')
  );