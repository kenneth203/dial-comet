CREATE OR REPLACE FUNCTION public.generate_checklist_for_user_internal(p_user_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
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
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_su
  FROM public.system_users
  WHERE user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND OR COALESCE(v_su.status, 'active') = 'inactive' THEN
    RETURN 0;
  END IF;

  SELECT si.*, st.name AS tname
  INTO v_shift
  FROM public.shift_assignments sa
  JOIN public.shift_instances si ON si.id = sa.shift_instance_id
  LEFT JOIN public.shift_templates st ON st.id = si.template_id
  WHERE sa.user_id = p_user_id
    AND si.shift_date = p_date
  ORDER BY si.start_time NULLS LAST
  LIMIT 1;

  v_shift_start := v_shift.start_time;
  v_shift_end := v_shift.end_time;
  v_shift_name_lower := lower(COALESCE(v_shift.tname, ''));
  v_dow := EXTRACT(DOW FROM p_date)::int;
  v_is_weekend := v_dow IN (0, 6);

  FOR v_tmpl IN
    SELECT *
    FROM public.checklist_templates
    WHERE is_active = true
  LOOP
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
      v_matches := v_tmpl.shift_scope IN ('morning', 'afternoon', 'evening');
    END IF;

    IF NOT v_matches THEN
      CONTINUE;
    END IF;

    IF v_tmpl.assigned_user_id IS NOT NULL
       AND v_tmpl.assigned_user_id <> COALESCE(v_su.id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      CONTINUE;
    END IF;
    IF v_tmpl.assigned_role IS NOT NULL
       AND v_tmpl.assigned_role <> COALESCE(v_su.role, '') THEN
      CONTINUE;
    END IF;
    IF v_tmpl.assigned_department IS NOT NULL
       AND v_tmpl.assigned_department <> COALESCE(v_su.department, '') THEN
      CONTINUE;
    END IF;

    IF v_tmpl.shift_scope = 'morning' THEN
      v_eff_start := GREATEST(COALESCE(v_shift_start, '09:00'::time), '09:00'::time);
      v_eff_end := LEAST(COALESCE(v_shift_end, '14:00'::time), '14:00'::time);
    ELSIF v_tmpl.shift_scope = 'afternoon' THEN
      v_eff_start := GREATEST(COALESCE(v_shift_start, '14:00'::time), '14:00'::time);
      v_eff_end := LEAST(COALESCE(v_shift_end, '17:00'::time), '17:00'::time);
    ELSIF v_tmpl.shift_scope = 'evening' THEN
      v_eff_start := GREATEST(COALESCE(v_shift_start, '17:00'::time), '17:00'::time);
      v_eff_end := LEAST(COALESCE(v_shift_end, '21:00'::time), '21:00'::time);
    ELSE
      v_eff_start := v_shift_start;
      v_eff_end := v_shift_end;
    END IF;

    IF v_eff_start IS NOT NULL AND v_eff_end IS NOT NULL AND v_eff_end < v_eff_start THEN
      v_eff_end := v_eff_start;
    END IF;

    FOR v_occ IN
      SELECT *
      FROM public.checklist_compute_due_times(v_tmpl.frequency_type, v_tmpl.custom_times, v_eff_start, v_eff_end)
    LOOP
      INSERT INTO public.checklist_instances
        (template_id, user_id, system_user_id, shift_instance_id, task_date, due_time, occurrence_index, occurrence_label, title, description, priority, customer_id, is_internal)
      VALUES
        (v_tmpl.id, p_user_id, v_su.id, v_shift.id, p_date, v_occ.due_time,
         v_occ.idx, v_occ.label,
         v_tmpl.template_name || ' - ' || v_occ.label,
         v_tmpl.description, v_tmpl.priority,
         v_tmpl.customer_id, COALESCE(v_tmpl.is_internal, false))
      ON CONFLICT (template_id, user_id, task_date, occurrence_index) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_checklist_for_user_internal(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_checklist_for_user_internal(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_checklist_for_user(p_user_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_caller <> p_user_id AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public.generate_checklist_for_user_internal(p_user_id, p_date);
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_checklist_for_user(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_checklist_for_user(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.regenerate_all_user_checklists_today()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u record;
  cnt integer := 0;
BEGIN
  DELETE FROM public.checklist_instances ci
  WHERE ci.task_date = CURRENT_DATE
    AND ci.status::text IN ('pending', 'scheduled', 'not_started')
    AND NOT EXISTS (
      SELECT 1
      FROM public.checklist_logs cl
      WHERE cl.instance_id = ci.id
    );

  FOR u IN
    SELECT DISTINCT su.user_id
    FROM public.system_users su
    WHERE su.user_id IS NOT NULL
      AND COALESCE(su.status, 'active') <> 'inactive'
  LOOP
    BEGIN
      cnt := cnt + public.generate_checklist_for_user_internal(u.user_id, CURRENT_DATE);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Checklist generation failed for user %: %', u.user_id, SQLERRM;
    END;
  END LOOP;

  RETURN cnt;
END;
$function$;

REVOKE ALL ON FUNCTION public.regenerate_all_user_checklists_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_all_user_checklists_today() TO authenticated, service_role;

SELECT public.regenerate_all_user_checklists_today();