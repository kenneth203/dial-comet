ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS require_contact_names boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_contact_names integer NOT NULL DEFAULT 3;

ALTER TABLE public.checklist_instances
  ADD COLUMN IF NOT EXISTS contact_names text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.complete_checklist_instance(p_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.checklist_instances;
  v_uid uuid := auth.uid();
  v_require boolean := false;
  v_min integer := 0;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_inst FROM public.checklist_instances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_inst.user_id <> v_uid AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='insufficient_privilege';
  END IF;

  IF v_inst.template_id IS NOT NULL THEN
    SELECT COALESCE(require_contact_names,false), COALESCE(min_contact_names,3)
      INTO v_require, v_min
    FROM public.checklist_templates WHERE id = v_inst.template_id;

    IF v_require THEN
      SELECT COALESCE(cardinality(ARRAY(
        SELECT n FROM unnest(v_inst.contact_names) AS n WHERE btrim(n) <> ''
      )), 0) INTO v_count;
      IF v_count < v_min THEN
        RAISE EXCEPTION 'At least % contact name(s) required before completing this task (got %).', v_min, v_count
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
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