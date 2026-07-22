
-- 1. Make task_notifications.task_id nullable so generic alerts (e.g., invoices) can be stored
ALTER TABLE public.task_notifications ALTER COLUMN task_id DROP NOT NULL;

-- 2. Recurring invoice schedules
CREATE TABLE public.recurring_invoice_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  service_type text NOT NULL,
  package_name text NOT NULL,
  package_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0.20,
  client_name text,
  company_name text,
  client_address text,
  notes text,
  frequency text NOT NULL DEFAULT 'monthly',
  day_of_month int NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_invoice_schedules TO authenticated;
GRANT ALL ON public.recurring_invoice_schedules TO service_role;

ALTER TABLE public.recurring_invoice_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ris_select_auth" ON public.recurring_invoice_schedules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ris_insert_admin" ON public.recurring_invoice_schedules
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_higher());
CREATE POLICY "ris_update_admin" ON public.recurring_invoice_schedules
  FOR UPDATE TO authenticated USING (is_admin_or_higher());
CREATE POLICY "ris_delete_admin" ON public.recurring_invoice_schedules
  FOR DELETE TO authenticated USING (is_admin_or_higher());

CREATE TRIGGER update_ris_updated_at BEFORE UPDATE ON public.recurring_invoice_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_ris_due ON public.recurring_invoice_schedules (active, next_run_at);

-- 3. Routine that creates invoices for all due schedules and notifies Super-Admins
CREATE OR REPLACE FUNCTION public.generate_due_recurring_invoices()
RETURNS TABLE(schedule_id uuid, invoice_id uuid, invoice_number text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric;
  v_vat_amount numeric;
  v_total numeric;
  v_admin record;
BEGIN
  FOR s IN
    SELECT * FROM public.recurring_invoice_schedules
    WHERE active = true AND next_run_at <= now()
  LOOP
    v_subtotal := COALESCE(s.package_price, 0);
    v_vat_amount := v_subtotal * COALESCE(s.vat_rate, 0);
    v_total := v_subtotal + v_vat_amount;
    v_invoice_number := 'INV-' || to_char(now(), 'YYYYMM') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.proposal_invoices (
      customer_id, invoice_number, service_type, package_name, package_price,
      subtotal, vat_rate, vat_amount, total, status,
      issued_at, due_at, client_name, company_name, client_address, notes, created_by
    ) VALUES (
      s.customer_id, v_invoice_number, s.service_type, s.package_name, v_subtotal,
      v_subtotal, s.vat_rate, v_vat_amount, v_total, 'pending',
      now(), now() + interval '7 days',
      s.client_name, s.company_name, s.client_address,
      COALESCE(s.notes, '') || E'\n[Auto-generated from recurring schedule]',
      s.created_by
    )
    RETURNING id INTO v_invoice_id;

    -- Notify every active Super-Admin
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

    -- Advance schedule
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
$$;

GRANT EXECUTE ON FUNCTION public.generate_due_recurring_invoices() TO authenticated, service_role;
