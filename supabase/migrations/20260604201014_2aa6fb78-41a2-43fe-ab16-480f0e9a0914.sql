
DO $$ BEGIN
  CREATE TYPE public.checklist_frequency AS ENUM
    ('once','twice','three_times','hourly','two_hourly','morning','afternoon','end_of_shift','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.checklist_shift_scope AS ENUM
    ('all','morning','afternoon','evening','weekend','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.checklist_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.checklist_instance_status AS ENUM
    ('not_started','completed','overdue','skipped','not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  description text,
  category text,
  assigned_role text,
  assigned_department text,
  assigned_user_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  frequency_type public.checklist_frequency NOT NULL DEFAULT 'once',
  custom_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  shift_scope public.checklist_shift_scope NOT NULL DEFAULT 'all',
  shift_template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  priority public.checklist_priority NOT NULL DEFAULT 'medium',
  reminder_offset_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_templates_select_auth" ON public.checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_templates_admin_insert" ON public.checklist_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "checklist_templates_admin_update" ON public.checklist_templates FOR UPDATE TO authenticated USING (public.is_admin_or_higher()) WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "checklist_templates_admin_delete" ON public.checklist_templates FOR DELETE TO authenticated USING (public.is_admin_or_higher());

CREATE TABLE IF NOT EXISTS public.checklist_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  system_user_id uuid REFERENCES public.system_users(id) ON DELETE SET NULL,
  shift_instance_id uuid,
  task_date date NOT NULL,
  due_time time,
  occurrence_index integer NOT NULL DEFAULT 1,
  occurrence_label text,
  title text NOT NULL,
  description text,
  priority public.checklist_priority NOT NULL DEFAULT 'medium',
  status public.checklist_instance_status NOT NULL DEFAULT 'not_started',
  completed_at timestamptz,
  completed_by uuid,
  completion_notes text,
  skipped_reason text,
  is_overdue boolean NOT NULL DEFAULT false,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, user_id, task_date, occurrence_index)
);

CREATE INDEX IF NOT EXISTS idx_checklist_instances_user_date ON public.checklist_instances (user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_checklist_instances_status ON public.checklist_instances (status);

GRANT SELECT, UPDATE ON public.checklist_instances TO authenticated;
GRANT ALL ON public.checklist_instances TO service_role;

ALTER TABLE public.checklist_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_instances_select" ON public.checklist_instances FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_or_higher());
CREATE POLICY "checklist_instances_update" ON public.checklist_instances FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin_or_higher()) WITH CHECK (user_id = auth.uid() OR public.is_admin_or_higher());
CREATE POLICY "checklist_instances_admin_insert" ON public.checklist_instances FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "checklist_instances_admin_delete" ON public.checklist_instances FOR DELETE TO authenticated USING (public.is_admin_or_higher());

CREATE TABLE IF NOT EXISTS public.checklist_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.checklist_instances(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  old_status public.checklist_instance_status,
  new_status public.checklist_instance_status,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_logs_instance ON public.checklist_logs (instance_id);

GRANT SELECT, INSERT ON public.checklist_logs TO authenticated;
GRANT ALL ON public.checklist_logs TO service_role;

ALTER TABLE public.checklist_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_logs_select" ON public.checklist_logs FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin_or_higher());
CREATE POLICY "checklist_logs_insert" ON public.checklist_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_admin_or_higher());

CREATE OR REPLACE FUNCTION public.checklist_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_checklist_templates_updated_at ON public.checklist_templates;
CREATE TRIGGER trg_checklist_templates_updated_at BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.checklist_set_updated_at();

DROP TRIGGER IF EXISTS trg_checklist_instances_updated_at ON public.checklist_instances;
CREATE TRIGGER trg_checklist_instances_updated_at BEFORE UPDATE ON public.checklist_instances
  FOR EACH ROW EXECUTE FUNCTION public.checklist_set_updated_at();

CREATE OR REPLACE FUNCTION public.checklist_compute_due_times(
  p_frequency public.checklist_frequency,
  p_custom_times jsonb,
  p_shift_start time,
  p_shift_end time
) RETURNS TABLE(idx integer, label text, due_time time)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_start time := COALESCE(p_shift_start, '09:00'::time);
  v_end   time := COALESCE(p_shift_end,   '17:00'::time);
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
      RETURN QUERY SELECT 1, 'Morning Check'::text, v_start;
    WHEN 'afternoon' THEN
      RETURN QUERY SELECT 1, 'Afternoon Check'::text, (v_start + v_dur/2);
    WHEN 'end_of_shift' THEN
      RETURN QUERY SELECT 1, 'End of Shift'::text, v_end;
    WHEN 'custom' THEN
      IF p_custom_times IS NOT NULL THEN
        FOR custom IN SELECT jsonb_array_elements_text(p_custom_times) LOOP
          BEGIN
            RETURN QUERY SELECT i, ('Check ' || i)::text, custom::time;
            i := i + 1;
          EXCEPTION WHEN others THEN NULL;
          END;
        END LOOP;
      END IF;
  END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.generate_checklist_for_user(p_user_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_su record;
  v_tmpl record;
  v_shift record;
  v_shift_start time;
  v_shift_end time;
  v_shift_name_lower text;
  v_inserted integer := 0;
  v_occ record;
  v_matches boolean;
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

  FOR v_tmpl IN SELECT * FROM public.checklist_templates WHERE is_active = true LOOP
    v_matches := false;
    IF v_tmpl.shift_scope = 'all' THEN
      v_matches := true;
    ELSIF v_tmpl.shift_scope = 'custom' THEN
      v_matches := v_shift.template_id = ANY(v_tmpl.shift_template_ids);
    ELSIF v_shift.id IS NOT NULL THEN
      v_matches := position(v_tmpl.shift_scope::text in v_shift_name_lower) > 0
                   OR (v_tmpl.shift_scope = 'weekend' AND EXTRACT(DOW FROM p_date) IN (0,6));
    ELSE
      v_matches := (v_tmpl.shift_scope = 'weekend' AND EXTRACT(DOW FROM p_date) IN (0,6));
    END IF;
    IF NOT v_matches THEN CONTINUE; END IF;

    IF v_tmpl.assigned_user_id IS NOT NULL AND v_tmpl.assigned_user_id <> COALESCE(v_su.id, '00000000-0000-0000-0000-000000000000'::uuid) THEN CONTINUE; END IF;
    IF v_tmpl.assigned_role IS NOT NULL AND v_tmpl.assigned_role <> COALESCE(v_su.role, '') THEN CONTINUE; END IF;
    IF v_tmpl.assigned_department IS NOT NULL AND v_tmpl.assigned_department <> COALESCE(v_su.department, '') THEN CONTINUE; END IF;

    FOR v_occ IN SELECT * FROM public.checklist_compute_due_times(v_tmpl.frequency_type, v_tmpl.custom_times, v_shift_start, v_shift_end) LOOP
      INSERT INTO public.checklist_instances
        (template_id, user_id, system_user_id, shift_instance_id, task_date, due_time, occurrence_index, occurrence_label, title, description, priority)
      VALUES
        (v_tmpl.id, p_user_id, v_su.id, v_shift.id, p_date, v_occ.due_time,
         v_occ.idx, v_occ.label,
         v_tmpl.template_name || ' - ' || v_occ.label,
         v_tmpl.description, v_tmpl.priority)
      ON CONFLICT (template_id, user_id, task_date, occurrence_index) DO NOTHING;
      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END $$;

CREATE OR REPLACE FUNCTION public.complete_checklist_instance(p_id uuid, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst public.checklist_instances; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_inst FROM public.checklist_instances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_inst.user_id <> v_uid AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='insufficient_privilege';
  END IF;
  UPDATE public.checklist_instances SET
    status='completed', completed_at=now(), completed_by=v_uid,
    completion_notes=COALESCE(p_notes, completion_notes), updated_at=now()
  WHERE id = p_id;
  INSERT INTO public.checklist_logs(instance_id, user_id, action, old_status, new_status, notes)
  VALUES (p_id, v_uid, 'complete', v_inst.status, 'completed', p_notes);
END $$;

CREATE OR REPLACE FUNCTION public.skip_checklist_instance(p_id uuid, p_reason text, p_status text DEFAULT 'skipped')
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst public.checklist_instances; v_uid uuid := auth.uid();
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
  INSERT INTO public.checklist_logs(instance_id, user_id, action, old_status, new_status, notes)
  VALUES (p_id, v_uid, p_status, v_inst.status, v_new, p_reason);
END $$;

CREATE OR REPLACE FUNCTION public.mark_overdue_checklist()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.checklist_instances
     SET is_overdue = true, status = 'overdue', updated_at = now()
   WHERE status = 'not_started'
     AND due_time IS NOT NULL
     AND (task_date + due_time) < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_checklist_for_user(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_checklist_instance(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.skip_checklist_instance(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_overdue_checklist() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.checklist_compute_due_times(public.checklist_frequency, jsonb, time, time) TO authenticated, service_role;

INSERT INTO public.app_permissions (section, feature, description)
SELECT * FROM (VALUES
  ('daily_checklist','menu_visible','Show Daily Checklist Templates in navigation'),
  ('daily_checklist','page_access','Open Daily Checklist Templates page'),
  ('daily_checklist','view','View checklist templates and reports'),
  ('daily_checklist','create','Create checklist templates'),
  ('daily_checklist','edit','Edit checklist templates'),
  ('daily_checklist','delete','Delete checklist templates'),
  ('daily_checklist','manage_settings','Manage checklist settings')
) AS v(section, feature, description)
ON CONFLICT DO NOTHING;
