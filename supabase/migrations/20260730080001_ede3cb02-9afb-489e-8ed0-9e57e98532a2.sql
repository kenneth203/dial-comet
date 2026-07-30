-- ============ Item 3: recurring invoice extra line items ============
ALTER TABLE public.recurring_invoice_schedules
  ADD COLUMN IF NOT EXISTS extra_line_items jsonb NOT NULL DEFAULT '[]'::jsonb;

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
  v_extra jsonb;
  v_extra_total numeric := 0;
  v_item jsonb;
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

    v_extra := COALESCE(s.extra_line_items, '[]'::jsonb);
    v_extra_total := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_extra)
    LOOP
      v_extra_total := v_extra_total
        + (COALESCE((v_item->>'quantity')::numeric, 1) * COALESCE((v_item->>'unit_price')::numeric, 0));
    END LOOP;

    v_subtotal := COALESCE(s.package_price, 0) + v_weekend_fee + v_addl_fee + v_extra_total;
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

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_extra)
    LOOP
      v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
        'description', COALESCE(v_item->>'description', 'Additional item'),
        'quantity', COALESCE((v_item->>'quantity')::numeric, 1),
        'unit_price', COALESCE((v_item->>'unit_price')::numeric, 0),
        'amount', COALESCE((v_item->>'quantity')::numeric, 1) * COALESCE((v_item->>'unit_price')::numeric, 0)
      ));
    END LOOP;

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

REVOKE EXECUTE ON FUNCTION public.generate_due_recurring_invoices() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_invoices() TO authenticated, service_role;

-- ============ Item 6: security hotfixes ============
DROP POLICY IF EXISTS "Admins can view inbound email log" ON public.inbound_email_log;

CREATE POLICY "Admins can view inbound email log"
ON public.inbound_email_log
FOR SELECT
TO authenticated
USING (public.is_admin_or_higher());

DROP POLICY IF EXISTS "Only service role can insert inbound email log" ON public.inbound_email_log;
CREATE POLICY "Only service role can insert inbound email log"
ON public.inbound_email_log
FOR INSERT
TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Only service role can update inbound email log" ON public.inbound_email_log;
CREATE POLICY "Only service role can update inbound email log"
ON public.inbound_email_log
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Only service role can delete inbound email log" ON public.inbound_email_log;
CREATE POLICY "Only service role can delete inbound email log"
ON public.inbound_email_log
FOR DELETE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "Admins can view database export backups" ON storage.objects;
CREATE POLICY "Admins can view database export backups"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'database_export_22_07_26' AND public.is_admin_or_higher());

DROP POLICY IF EXISTS "Admins can upload database export backups" ON storage.objects;
CREATE POLICY "Admins can upload database export backups"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'database_export_22_07_26' AND public.is_admin_or_higher());

DROP POLICY IF EXISTS "Admins can update database export backups" ON storage.objects;
CREATE POLICY "Admins can update database export backups"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'database_export_22_07_26' AND public.is_admin_or_higher())
WITH CHECK (bucket_id = 'database_export_22_07_26' AND public.is_admin_or_higher());

DROP POLICY IF EXISTS "Admins can delete database export backups" ON storage.objects;
CREATE POLICY "Admins can delete database export backups"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'database_export_22_07_26' AND public.is_admin_or_higher());