CREATE OR REPLACE FUNCTION public.sync_checklist_instance_team_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sibling public.checklist_instances%ROWTYPE;
BEGIN
  IF NEW.template_id IS NULL OR NEW.status IN ('completed','skipped','not_applicable') THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_sibling
  FROM public.checklist_instances ci
  WHERE ci.template_id = NEW.template_id
    AND ci.task_date = NEW.task_date
    AND COALESCE(ci.occurrence_index, 0) = COALESCE(NEW.occurrence_index, 0)
    AND ci.id <> NEW.id
    AND ci.status IN ('completed','skipped','not_applicable')
  ORDER BY
    CASE ci.status
      WHEN 'completed' THEN 1
      WHEN 'skipped' THEN 2
      ELSE 3
    END,
    ci.completed_at NULLS LAST,
    ci.updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.status := v_sibling.status;
    NEW.completed_at := v_sibling.completed_at;
    NEW.completed_by := v_sibling.completed_by;
    NEW.completion_notes := COALESCE(NEW.completion_notes, v_sibling.completion_notes);
    NEW.skipped_reason := COALESCE(NEW.skipped_reason, v_sibling.skipped_reason);
    NEW.is_overdue := false;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_checklist_instance_team_status ON public.checklist_instances;
CREATE TRIGGER trg_sync_checklist_instance_team_status
BEFORE INSERT ON public.checklist_instances
FOR EACH ROW
EXECUTE FUNCTION public.sync_checklist_instance_team_status();

CREATE OR REPLACE FUNCTION public.complete_checklist_instance(p_id uuid, p_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.checklist_instances;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_inst FROM public.checklist_instances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_inst.user_id <> v_uid AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='insufficient_privilege';
  END IF;

  UPDATE public.checklist_instances SET
    status = 'completed',
    completed_at = COALESCE(completed_at, now()),
    completed_by = COALESCE(completed_by, v_uid),
    completion_notes = COALESCE(p_notes, completion_notes),
    is_overdue = false,
    updated_at = now()
  WHERE id = p_id;

  IF v_inst.template_id IS NOT NULL THEN
    UPDATE public.checklist_instances SET
      status = 'completed',
      completed_at = COALESCE(completed_at, now()),
      completed_by = COALESCE(completed_by, v_uid),
      completion_notes = COALESCE(p_notes, completion_notes),
      is_overdue = false,
      updated_at = now()
    WHERE template_id = v_inst.template_id
      AND task_date = v_inst.task_date
      AND COALESCE(occurrence_index, 0) = COALESCE(v_inst.occurrence_index, 0)
      AND id <> p_id
      AND status NOT IN ('completed','skipped','not_applicable');
  END IF;

  INSERT INTO public.checklist_logs(instance_id, user_id, action, old_status, new_status, notes)
  VALUES (p_id, v_uid, 'complete', v_inst.status, 'completed', p_notes);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sync_checklist_instance_team_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_checklist_instance(uuid, text) TO authenticated, service_role;

WITH closed_sibling AS (
  SELECT DISTINCT ON (open_ci.id)
    open_ci.id AS open_id,
    closed_ci.status,
    closed_ci.completed_at,
    closed_ci.completed_by,
    closed_ci.completion_notes,
    closed_ci.skipped_reason
  FROM public.checklist_instances open_ci
  JOIN public.checklist_instances closed_ci
    ON closed_ci.template_id = open_ci.template_id
   AND closed_ci.task_date = open_ci.task_date
   AND COALESCE(closed_ci.occurrence_index, 0) = COALESCE(open_ci.occurrence_index, 0)
   AND closed_ci.id <> open_ci.id
   AND closed_ci.status IN ('completed','skipped','not_applicable')
  WHERE open_ci.status IN ('not_started','overdue')
  ORDER BY open_ci.id,
    CASE closed_ci.status
      WHEN 'completed' THEN 1
      WHEN 'skipped' THEN 2
      ELSE 3
    END,
    closed_ci.completed_at NULLS LAST,
    closed_ci.updated_at DESC
)
UPDATE public.checklist_instances ci
SET status = closed_sibling.status,
    completed_at = closed_sibling.completed_at,
    completed_by = closed_sibling.completed_by,
    completion_notes = COALESCE(ci.completion_notes, closed_sibling.completion_notes),
    skipped_reason = COALESCE(ci.skipped_reason, closed_sibling.skipped_reason),
    is_overdue = false,
    updated_at = now()
FROM closed_sibling
WHERE ci.id = closed_sibling.open_id;