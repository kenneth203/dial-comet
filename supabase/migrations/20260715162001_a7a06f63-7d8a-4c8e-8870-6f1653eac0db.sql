
-- 1. Add admin guard to leave quota RPCs
CREATE OR REPLACE FUNCTION public.apply_leave_quota_defaults(p_year integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_defaults RECORD;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_defaults FROM public.leave_quota_defaults WHERE year = p_year;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No defaults found for year %', p_year;
  END IF;

  INSERT INTO public.holiday_entitlements (user_id, year, annual_leave_entitlement)
  SELECT su.id, p_year, v_defaults.base_annual
  FROM public.system_users su
  WHERE su.status = 'Active'
  ON CONFLICT (user_id, year) DO UPDATE SET
    annual_leave_entitlement = v_defaults.base_annual,
    updated_at = now();

  UPDATE public.leave_quota_defaults SET applied_at = now() WHERE year = p_year;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_leave_quota_defaults(p_year integer, p_base_annual numeric DEFAULT 25.0, p_bank_holidays numeric DEFAULT 10.0, p_christmas_closure_days numeric DEFAULT 5.0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.leave_quota_defaults (year, base_annual, bank_holidays, christmas_closure_days)
  VALUES (p_year, p_base_annual, p_bank_holidays, p_christmas_closure_days)
  ON CONFLICT (year) DO UPDATE SET
    base_annual = p_base_annual,
    bank_holidays = p_bank_holidays,
    christmas_closure_days = p_christmas_closure_days,
    updated_at = now();
END;
$function$;

-- 2. Add ownership/admin check to save_checklist_instance_note
CREATE OR REPLACE FUNCTION public.save_checklist_instance_note(p_id uuid, p_notes text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_notes text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_result text;
  v_inst RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to save notes.';
  END IF;

  IF length(COALESCE(v_notes, '')) > 5000 THEN
    RAISE EXCEPTION 'Note is too long.';
  END IF;

  SELECT * INTO v_inst FROM public.checklist_instances WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item not found.';
  END IF;

  IF v_inst.user_id <> v_uid AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.checklist_instances
  SET completion_notes = v_notes,
      updated_at = now()
  WHERE id = p_id
  RETURNING completion_notes INTO v_result;

  INSERT INTO public.checklist_logs(instance_id, user_id, action, notes)
  VALUES (p_id, v_uid, 'note_saved', v_notes);

  RETURN COALESCE(v_result, '');
END;
$function$;

-- 3. Admin guard on generate_due_recurring_invoices
CREATE OR REPLACE FUNCTION public.generate_due_recurring_invoices()
RETURNS TABLE(schedule_id uuid, invoice_id uuid, invoice_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric;
  v_vat_amount numeric;
  v_total numeric;
  v_admin record;
  v_line_items jsonb;
  v_weekend_fee numeric;
  v_addl_fee numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR s IN
    SELECT * FROM public.recurring_invoice_schedules
    WHERE active = true AND next_run_at <= now()
  LOOP
    v_weekend_fee := CASE WHEN s.weekend_cover THEN COALESCE(s.weekend_cover_fee, 0) ELSE 0 END;
    v_addl_fee := CASE WHEN s.additional_lines THEN COALESCE(s.additional_lines_fee, 0) ELSE 0 END;
    v_subtotal := COALESCE(s.package_price, 0) + v_weekend_fee + v_addl_fee;
    v_vat_amount := v_subtotal * COALESCE(s.vat_rate, 0);
    v_total := v_subtotal + v_vat_amount;
    v_invoice_number := 'INV-' || to_char(now(), 'YYYYMM') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    v_line_items := jsonb_build_array(
      jsonb_build_object(
        'description', s.service_type || ' — ' || s.package_name,
        'quantity', 1,
        'unit_price', COALESCE(s.package_price, 0),
        'amount', COALESCE(s.package_price, 0)
      )
    );
    IF s.weekend_cover THEN
      v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
        'description', 'Weekend Cover', 'quantity', 1,
        'unit_price', v_weekend_fee, 'amount', v_weekend_fee
      ));
    END IF;
    IF s.additional_lines THEN
      v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
        'description', 'Additional Lines', 'quantity', 1,
        'unit_price', v_addl_fee, 'amount', v_addl_fee
      ));
    END IF;

    INSERT INTO public.proposal_invoices (
      customer_id, invoice_number, service_type, package_name, package_price,
      subtotal, vat_rate, vat_amount, total, status,
      issued_at, due_at, client_name, company_name, client_address, notes, created_by, line_items
    ) VALUES (
      s.customer_id, v_invoice_number, s.service_type, s.package_name, COALESCE(s.package_price, 0),
      v_subtotal, s.vat_rate, v_vat_amount, v_total, 'pending',
      now(), now() + interval '7 days',
      s.client_name, s.company_name, s.client_address,
      COALESCE(s.notes, '') || E'\n[Auto-generated from recurring schedule]',
      s.created_by, v_line_items
    )
    RETURNING id INTO v_invoice_id;

    FOR v_admin IN
      SELECT user_id FROM public.profiles
      WHERE role = 'Super-Admin' AND status = 'Active' AND user_id IS NOT NULL
    LOOP
      INSERT INTO public.task_notifications (task_id, user_id, type, message, is_read)
      VALUES (
        NULL, v_admin.user_id, 'invoice_review',
        'New recurring proposal invoice ' || v_invoice_number || ' (£' || to_char(v_total, 'FM999G999D00') || ') ready for review',
        false
      );
    END LOOP;

    UPDATE public.recurring_invoice_schedules
    SET last_run_at = now(),
        next_run_at = (date_trunc('month', next_run_at) + interval '1 month' + (s.day_of_month - 1) * interval '1 day')
    WHERE id = s.id;

    schedule_id := s.id;
    invoice_id := v_invoice_id;
    invoice_number := v_invoice_number;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- 4. Admin guard on generate_shift_instances
CREATE OR REPLACE FUNCTION public.generate_shift_instances(
  template_id_param UUID,
  start_date_param DATE,
  end_date_param DATE
) RETURNS INTEGER AS $$
DECLARE
  template_record RECORD;
  loop_date DATE;
  day_of_week INTEGER;
  instances_created INTEGER := 0;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO template_record 
  FROM public.shift_templates 
  WHERE id = template_id_param AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not active';
  END IF;
  
  loop_date := start_date_param;
  WHILE loop_date <= end_date_param LOOP
    day_of_week := EXTRACT(DOW FROM loop_date);
    
    IF day_of_week = ANY(template_record.days_of_week) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.shift_instances 
        WHERE template_id = template_id_param AND shift_date = loop_date
      ) THEN
        INSERT INTO public.shift_instances (
          template_id, shift_date, start_time, end_time, 
          headcount_needed, role_name, color_code, status
        ) VALUES (
          template_id_param, loop_date, template_record.start_time, 
          template_record.end_time, template_record.headcount,
          template_record.role_name, template_record.color_code, 'open'::assignment_status
        );
        instances_created := instances_created + 1;
      END IF;
    END IF;
    
    loop_date := loop_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN instances_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Tighten customer_mapping_presets / customer_mapping_versions write policies to owner or admin
DROP POLICY IF EXISTS "Auth can update mapping presets" ON public.customer_mapping_presets;
DROP POLICY IF EXISTS "Auth can delete mapping presets" ON public.customer_mapping_presets;
DROP POLICY IF EXISTS "Auth can insert mapping presets" ON public.customer_mapping_presets;

CREATE POLICY "Owners or admins can insert mapping presets"
  ON public.customer_mapping_presets FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_admin_or_higher());

CREATE POLICY "Owners or admins can update mapping presets"
  ON public.customer_mapping_presets FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin_or_higher())
  WITH CHECK (created_by = auth.uid() OR public.is_admin_or_higher());

CREATE POLICY "Owners or admins can delete mapping presets"
  ON public.customer_mapping_presets FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin_or_higher());

DROP POLICY IF EXISTS "Authenticated can insert mapping versions" ON public.customer_mapping_versions;

CREATE POLICY "Owners or admins can insert mapping versions"
  ON public.customer_mapping_versions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_admin_or_higher());

-- 6. task_attachments storage UPDATE policy: add can_access_task check
DROP POLICY IF EXISTS "task_attachments_update" ON storage.objects;
CREATE POLICY "task_attachments_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (public.is_super_admin() OR owner = auth.uid())
    AND public.can_access_task((NULLIF(split_part(name, '/', 1), ''))::uuid)
  )
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND (public.is_super_admin() OR owner = auth.uid())
    AND public.can_access_task((NULLIF(split_part(name, '/', 1), ''))::uuid)
  );
