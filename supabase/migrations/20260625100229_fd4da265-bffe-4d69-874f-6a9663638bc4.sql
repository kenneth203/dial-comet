
CREATE OR REPLACE FUNCTION public.generate_checklist_for_user(p_user_id uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_su record;
  v_tmpl record;
  v_shift record;
  v_shift_start time;
  v_shift_end time;
  v_eff_start time;
  v_eff_end time;
  v_shift_name_lower text;
  v_inserted integer := 0;
  v_occ record;
  v_matches boolean;
  v_is_weekend boolean;
  v_dow integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN 0; END IF;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='insufficient_privilege'; END IF;
  IF v_caller <> p_user_id AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_su FROM public.system_users WHERE user_id = p_user_id LIMIT 1;

  SELECT si.*, st.name AS tname
  INTO v_shift
  FROM public.shift_assignments sa
  JOIN public.shift_instances si ON si.id = sa.shift_instance_id
  LEFT JOIN public.shift_templates st ON st.id = si.template_id
  WHERE sa.user_id = p_user_id AND si.shift_date = p_date
  ORDER BY si.start_time NULLS LAST
  LIMIT 1;

  v_shift_start := v_shift.start_time;
  v_shift_end   := v_shift.end_time;
  v_shift_name_lower := lower(COALESCE(v_shift.tname, ''));
  v_dow := EXTRACT(DOW FROM p_date)::int;
  v_is_weekend := v_dow IN (0,6);

  FOR v_tmpl IN SELECT * FROM public.checklist_templates WHERE is_active = true LOOP
    IF v_tmpl.days_of_week IS NOT NULL
       AND array_length(v_tmpl.days_of_week, 1) IS NOT NULL
       AND NOT (v_dow = ANY(v_tmpl.days_of_week)) THEN
      CONTINUE;
    END IF;

    v_matches := false;
    IF v_tmpl.shift_scope = 'all' THEN
      v_matches := true;
    ELSIF v_tmpl.shift_scope = 'custom' THEN
      v_matches := v_shift.template_id = ANY(v_tmpl.shift_template_ids);
    ELSIF v_tmpl.shift_scope = 'weekend' THEN
      v_matches := v_is_weekend;
    ELSIF v_shift.id IS NOT NULL THEN
      v_matches := position(v_tmpl.shift_scope::text in v_shift_name_lower) > 0;
    ELSE
      v_matches := v_tmpl.shift_scope IN ('morning','afternoon','evening');
    END IF;
    IF NOT v_matches THEN CONTINUE; END IF;

    IF v_tmpl.assigned_user_id IS NOT NULL AND v_tmpl.assigned_user_id <> COALESCE(v_su.id, '00000000-0000-0000-0000-000000000000'::uuid) THEN CONTINUE; END IF;
    IF v_tmpl.assigned_role IS NOT NULL AND v_tmpl.assigned_role <> COALESCE(v_su.role, '') THEN CONTINUE; END IF;
    IF v_tmpl.assigned_department IS NOT NULL AND v_tmpl.assigned_department <> COALESCE(v_su.department, '') THEN CONTINUE; END IF;

    IF v_tmpl.shift_scope = 'morning' THEN
      v_eff_start := GREATEST(COALESCE(v_shift_start, '09:00'::time), '09:00'::time);
      v_eff_end   := LEAST(COALESCE(v_shift_end,   '14:00'::time), '14:00'::time);
    ELSIF v_tmpl.shift_scope = 'afternoon' THEN
      v_eff_start := GREATEST(COALESCE(v_shift_start, '14:00'::time), '14:00'::time);
      v_eff_end   := LEAST(COALESCE(v_shift_end,   '17:00'::time), '17:00'::time);
    ELSIF v_tmpl.shift_scope = 'evening' THEN
      v_eff_start := GREATEST(COALESCE(v_shift_start, '17:00'::time), '17:00'::time);
      v_eff_end   := LEAST(COALESCE(v_shift_end,   '21:00'::time), '21:00'::time);
    ELSE
      v_eff_start := v_shift_start;
      v_eff_end   := v_shift_end;
    END IF;
    IF v_eff_start IS NOT NULL AND v_eff_end IS NOT NULL AND v_eff_end < v_eff_start THEN
      v_eff_end := v_eff_start;
    END IF;

    FOR v_occ IN SELECT * FROM public.checklist_compute_due_times(v_tmpl.frequency_type, v_tmpl.custom_times, v_eff_start, v_eff_end) LOOP
      INSERT INTO public.checklist_instances
        (template_id, user_id, system_user_id, shift_instance_id, task_date, due_time, occurrence_index, occurrence_label, title, description, priority, customer_id, is_internal)
      VALUES
        (v_tmpl.id, p_user_id, v_su.id, v_shift.id, p_date, v_occ.due_time,
         v_occ.idx, v_occ.label,
         v_tmpl.template_name || ' - ' || v_occ.label,
         v_tmpl.description, v_tmpl.priority,
         v_tmpl.customer_id, COALESCE(v_tmpl.is_internal, false))
      ON CONFLICT (template_id, user_id, task_date, occurrence_index) DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END $function$;

CREATE OR REPLACE FUNCTION public.checklist_compute_due_times(p_frequency checklist_frequency, p_custom_times jsonb, p_shift_start time without time zone, p_shift_end time without time zone)
 RETURNS TABLE(idx integer, label text, due_time time without time zone)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_morning_start CONSTANT time := '09:00';
  v_afternoon_start CONSTANT time := '14:00';
  v_day_end CONSTANT time := '17:00';
  v_start time := COALESCE(p_shift_start, v_morning_start);
  v_end   time := COALESCE(p_shift_end,   v_day_end);
  v_dur   interval;
  v_t     timestamp;
  i       integer := 1;
  custom  text;
BEGIN
  v_dur := (v_end - v_start);
  CASE p_frequency
    WHEN 'once' THEN
      RETURN QUERY SELECT 1, 'Check'::text, v_start;
    WHEN 'twice' THEN
      RETURN QUERY SELECT 1, 'First Check'::text, v_start;
      RETURN QUERY SELECT 2, 'Final Check'::text, (v_start + v_dur/2);
    WHEN 'three_times' THEN
      RETURN QUERY SELECT 1, 'First Check'::text, v_start;
      RETURN QUERY SELECT 2, 'Second Check'::text, (v_start + v_dur/2);
      RETURN QUERY SELECT 3, 'Final Check'::text, v_end;
    WHEN 'hourly' THEN
      v_t := (CURRENT_DATE + v_start);
      WHILE v_t::time <= v_end LOOP
        RETURN QUERY SELECT i, ('Check ' || i)::text, v_t::time;
        v_t := v_t + interval '1 hour';
        i := i + 1;
      END LOOP;
    WHEN 'two_hourly' THEN
      v_t := (CURRENT_DATE + v_start);
      WHILE v_t::time <= v_end LOOP
        RETURN QUERY SELECT i, ('Check ' || i)::text, v_t::time;
        v_t := v_t + interval '2 hours';
        i := i + 1;
      END LOOP;
    WHEN 'morning' THEN
      RETURN QUERY SELECT 1, 'Morning Check (09:00-14:00)'::text, v_start;
    WHEN 'afternoon' THEN
      RETURN QUERY SELECT 1, 'Afternoon Check (14:00-17:00)'::text, v_start;
    WHEN 'end_of_shift' THEN
      RETURN QUERY SELECT 1, 'End of Shift'::text, v_end;
    WHEN 'custom' THEN
      FOR custom IN SELECT jsonb_array_elements_text(COALESCE(p_custom_times, '[]'::jsonb)) LOOP
        RETURN QUERY SELECT i, ('Check at ' || custom)::text, custom::time;
        i := i + 1;
      END LOOP;
  END CASE;
END;
$function$;

-- Backfill: remove today's not-yet-actioned items on AM/PM/Evening templates so the
-- next dashboard load regenerates them with the corrected windows. Completed,
-- skipped, overdue and not-applicable items are preserved.
DELETE FROM public.checklist_instances ci
USING public.checklist_templates t
WHERE ci.template_id = t.id
  AND ci.task_date = CURRENT_DATE
  AND ci.status = 'not_started'
  AND t.shift_scope IN ('morning','afternoon','evening');
