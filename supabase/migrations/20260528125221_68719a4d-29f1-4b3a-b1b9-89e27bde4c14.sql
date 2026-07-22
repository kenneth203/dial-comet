ALTER TABLE public.recurring_invoice_schedules
  ADD COLUMN IF NOT EXISTS weekend_cover boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekend_cover_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_lines boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS additional_lines_fee numeric NOT NULL DEFAULT 0;

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