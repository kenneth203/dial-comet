
-- Make daily checklist completion team-shared: when any user completes (or skips)
-- a checklist instance, propagate the same status to all sibling instances for
-- the same template + date + occurrence, so the work isn't duplicated across
-- every team member's dashboard.

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

  -- Update the triggering instance
  UPDATE public.checklist_instances SET
    status='completed', completed_at=now(), completed_by=v_uid,
    completion_notes=COALESCE(p_notes, completion_notes), updated_at=now()
  WHERE id = p_id;

  -- Propagate to all sibling instances (same template + date + occurrence)
  -- so the entire team's dashboards reflect that the task is done.
  IF v_inst.template_id IS NOT NULL THEN
    UPDATE public.checklist_instances SET
      status='completed', completed_at=now(), completed_by=v_uid,
      completion_notes=COALESCE(p_notes, completion_notes), updated_at=now()
    WHERE template_id = v_inst.template_id
      AND task_date = v_inst.task_date
      AND COALESCE(occurrence_index, 0) = COALESCE(v_inst.occurrence_index, 0)
      AND id <> p_id
      AND status NOT IN ('completed','skipped','not_applicable');
  END IF;

  INSERT INTO public.checklist_logs(instance_id, user_id, action, old_status, new_status, notes)
  VALUES (p_id, v_uid, 'complete', v_inst.status, 'completed', p_notes);
END $function$;

CREATE OR REPLACE FUNCTION public.skip_checklist_instance(p_id uuid, p_reason text, p_status text DEFAULT 'skipped'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.checklist_instances;
  v_uid uuid := auth.uid();
  v_new public.checklist_instance_status;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'Reason required'; END IF;
  IF p_status NOT IN ('skipped','not_applicable') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  v_new := p_status::public.checklist_instance_status;

  SELECT * INTO v_inst FROM public.checklist_instances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_inst.user_id <> v_uid AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='insufficient_privilege';
  END IF;

  UPDATE public.checklist_instances SET
    status = v_new, skipped_reason = p_reason, completed_by = v_uid,
    completed_at = now(), updated_at = now()
  WHERE id = p_id;

  -- Propagate skip/N-A to siblings so the team doesn't re-do the work.
  IF v_inst.template_id IS NOT NULL THEN
    UPDATE public.checklist_instances SET
      status = v_new, skipped_reason = p_reason, completed_by = v_uid,
      completed_at = now(), updated_at = now()
    WHERE template_id = v_inst.template_id
      AND task_date = v_inst.task_date
      AND COALESCE(occurrence_index, 0) = COALESCE(v_inst.occurrence_index, 0)
      AND id <> p_id
      AND status NOT IN ('completed','skipped','not_applicable');
  END IF;

  INSERT INTO public.checklist_logs(instance_id, user_id, action, old_status, new_status, notes)
  VALUES (p_id, v_uid, p_status, v_inst.status, v_new, p_reason);
END $function$;

-- Backfill: for every checklist instance completed/skipped today, propagate the
-- same closing status to every sibling instance still open. This cleans up the
-- duplicates the user is seeing right now (e.g. tasks Tara closed this morning
-- that still appear open for other operators).
WITH closed AS (
  SELECT DISTINCT ON (template_id, task_date, COALESCE(occurrence_index,0))
    template_id, task_date, occurrence_index, status, completed_at, completed_by, completion_notes, skipped_reason
  FROM public.checklist_instances
  WHERE template_id IS NOT NULL
    AND status IN ('completed','skipped','not_applicable')
    AND task_date >= CURRENT_DATE - INTERVAL '1 day'
  ORDER BY template_id, task_date, COALESCE(occurrence_index,0), completed_at DESC NULLS LAST
)
UPDATE public.checklist_instances ci
SET status = c.status,
    completed_at = COALESCE(ci.completed_at, c.completed_at),
    completed_by = COALESCE(ci.completed_by, c.completed_by),
    completion_notes = COALESCE(ci.completion_notes, c.completion_notes),
    skipped_reason = COALESCE(ci.skipped_reason, c.skipped_reason),
    updated_at = now()
FROM closed c
WHERE ci.template_id = c.template_id
  AND ci.task_date = c.task_date
  AND COALESCE(ci.occurrence_index,0) = COALESCE(c.occurrence_index,0)
  AND ci.status NOT IN ('completed','skipped','not_applicable');
