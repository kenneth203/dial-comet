
-- =====================================================
-- Phase 1: Unified Billing Schema
-- =====================================================

-- 1) Extend customers with call-answering billing fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS call_package_name text,
  ADD COLUMN IF NOT EXISTS call_base_allowance integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_included_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_monthly_charge numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_rate_per_call numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_rate_per_minute numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_rate_sms numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_rate_transfer_landline numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_rate_transfer_mobile numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS call_billing_unit text DEFAULT 'per_call',
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,4) DEFAULT 0.20;

-- Backfill call_* on customers from billing_customers (match on name or telephone)
UPDATE public.customers c
SET
  call_package_name = COALESCE(c.call_package_name, bc.package_name),
  call_base_allowance = COALESCE(NULLIF(c.call_base_allowance,0), bc.base_call_allowance),
  call_monthly_charge = COALESCE(NULLIF(c.call_monthly_charge,0), bc.monthly_charge),
  call_rate_per_call = COALESCE(NULLIF(c.call_rate_per_call,0), bc.rate_per_call),
  call_rate_per_minute = COALESCE(NULLIF(c.call_rate_per_minute,0), bc.rate_per_minute),
  call_rate_sms = COALESCE(NULLIF(c.call_rate_sms,0), bc.rate_sms),
  call_rate_transfer_landline = COALESCE(NULLIF(c.call_rate_transfer_landline,0), bc.rate_transfer_landline),
  call_rate_transfer_mobile = COALESCE(NULLIF(c.call_rate_transfer_mobile,0), bc.rate_transfer_mobile)
FROM public.billing_customers bc
WHERE lower(trim(c.name)) = lower(trim(bc.name))
   OR (bc.telephone IS NOT NULL AND public.normalize_phone(bc.telephone) IS NOT NULL
       AND (public.normalize_phone(c.tel) = public.normalize_phone(bc.telephone)
         OR public.normalize_phone(c.mobile) = public.normalize_phone(bc.telephone)
         OR public.normalize_phone(c.phone) = public.normalize_phone(bc.telephone)));

-- 2) internal_billing_periods
CREATE TABLE IF NOT EXISTS public.internal_billing_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  period_label text NOT NULL,                  -- 'YYYY-MM'
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Call totals
  total_calls integer NOT NULL DEFAULT 0,
  included_calls integer NOT NULL DEFAULT 0,
  overage_calls integer NOT NULL DEFAULT 0,
  total_call_seconds integer NOT NULL DEFAULT 0,
  overage_minutes integer NOT NULL DEFAULT 0,
  call_base_charge numeric(12,2) NOT NULL DEFAULT 0,
  call_overage_charge numeric(12,2) NOT NULL DEFAULT 0,
  -- VA totals
  total_va_seconds integer NOT NULL DEFAULT 0,
  included_va_seconds integer NOT NULL DEFAULT 0,
  overage_va_seconds integer NOT NULL DEFAULT 0,
  va_base_charge numeric(12,2) NOT NULL DEFAULT 0,
  va_overage_charge numeric(12,2) NOT NULL DEFAULT 0,
  va_task_charge numeric(12,2) NOT NULL DEFAULT 0,
  -- Aggregates
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.20,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, period_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_billing_periods TO authenticated;
GRANT ALL ON public.internal_billing_periods TO service_role;
ALTER TABLE public.internal_billing_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ibp_select_admin" ON public.internal_billing_periods FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "ibp_insert_admin" ON public.internal_billing_periods FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "ibp_update_admin" ON public.internal_billing_periods FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "ibp_delete_admin" ON public.internal_billing_periods FOR DELETE TO authenticated USING (public.is_admin_or_higher());

CREATE INDEX IF NOT EXISTS idx_ibp_customer ON public.internal_billing_periods(customer_id);
CREATE INDEX IF NOT EXISTS idx_ibp_period ON public.internal_billing_periods(period_label);

-- 3) internal_invoices
CREATE TABLE IF NOT EXISTS public.internal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL UNIQUE REFERENCES public.internal_billing_periods(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  -- Snapshot
  customer_name text,
  call_package_name text,
  va_package_name text,
  call_base_charge numeric(12,2) NOT NULL DEFAULT 0,
  call_overage_charge numeric(12,2) NOT NULL DEFAULT 0,
  va_base_charge numeric(12,2) NOT NULL DEFAULT 0,
  va_overage_charge numeric(12,2) NOT NULL DEFAULT 0,
  va_task_charge numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.20,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',          -- draft|approved|sent_to_xero|internal_record_only
  notes text,
  xero_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_invoices TO authenticated;
GRANT ALL ON public.internal_invoices TO service_role;
ALTER TABLE public.internal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iinv_select_admin" ON public.internal_invoices FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "iinv_insert_admin" ON public.internal_invoices FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_higher());
CREATE POLICY "iinv_update_admin" ON public.internal_invoices FOR UPDATE TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "iinv_delete_admin" ON public.internal_invoices FOR DELETE TO authenticated USING (public.is_admin_or_higher());

CREATE INDEX IF NOT EXISTS idx_iinv_customer ON public.internal_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_iinv_status ON public.internal_invoices(status);

-- 4) invoice_call_lines
CREATE TABLE IF NOT EXISTS public.invoice_call_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.internal_invoices(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.call_logs(call_id) ON DELETE SET NULL,
  description text,
  duration_seconds integer NOT NULL DEFAULT 0,
  charge numeric(12,4) NOT NULL DEFAULT 0,
  is_overage boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_call_lines TO authenticated;
GRANT ALL ON public.invoice_call_lines TO service_role;
ALTER TABLE public.invoice_call_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icl_select_admin" ON public.invoice_call_lines FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "icl_write_admin" ON public.invoice_call_lines FOR ALL TO authenticated USING (public.is_admin_or_higher()) WITH CHECK (public.is_admin_or_higher());
CREATE INDEX IF NOT EXISTS idx_icl_invoice ON public.invoice_call_lines(invoice_id);

-- 5) invoice_va_lines
CREATE TABLE IF NOT EXISTS public.invoice_va_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.internal_invoices(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  description text,
  billable_seconds integer NOT NULL DEFAULT 0,
  rate numeric(12,4) NOT NULL DEFAULT 0,
  charge numeric(12,4) NOT NULL DEFAULT 0,
  line_type text NOT NULL DEFAULT 'included',  -- included|overage|task_fee|project|retainer
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_va_lines TO authenticated;
GRANT ALL ON public.invoice_va_lines TO service_role;
ALTER TABLE public.invoice_va_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ivl_select_admin" ON public.invoice_va_lines FOR SELECT TO authenticated USING (public.is_admin_or_higher());
CREATE POLICY "ivl_write_admin" ON public.invoice_va_lines FOR ALL TO authenticated USING (public.is_admin_or_higher()) WITH CHECK (public.is_admin_or_higher());
CREATE INDEX IF NOT EXISTS idx_ivl_invoice ON public.invoice_va_lines(invoice_id);

-- 6) updated_at triggers
CREATE TRIGGER trg_ibp_updated_at BEFORE UPDATE ON public.internal_billing_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_iinv_updated_at BEFORE UPDATE ON public.internal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Generation RPC: single customer × period
CREATE OR REPLACE FUNCTION public.generate_internal_invoice_for_period(
  p_customer_id uuid,
  p_period_label text  -- 'YYYY-MM'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust public.customers%ROWTYPE;
  v_period_start date;
  v_period_end date;
  v_billing_day int;
  v_total_calls int := 0;
  v_total_call_seconds int := 0;
  v_included_calls int := 0;
  v_overage_calls int := 0;
  v_overage_minutes int := 0;
  v_call_base numeric(12,2) := 0;
  v_call_overage numeric(12,2) := 0;
  v_total_va_seconds int := 0;
  v_included_va_seconds int := 0;
  v_overage_va_seconds int := 0;
  v_va_base numeric(12,2) := 0;
  v_va_overage numeric(12,2) := 0;
  v_va_task numeric(12,2) := 0;
  v_vat_rate numeric(5,4);
  v_subtotal numeric(12,2);
  v_vat numeric(12,2);
  v_total numeric(12,2);
  v_period_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_existing_status text;
  v_year int;
  v_month int;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;

  -- Period window
  v_year := split_part(p_period_label, '-', 1)::int;
  v_month := split_part(p_period_label, '-', 2)::int;
  v_billing_day := LEAST(GREATEST(COALESCE(EXTRACT(DAY FROM v_cust.billing_day)::int, 1), 1), 28);
  v_period_start := make_date(v_year, v_month, v_billing_day);
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

  -- VAT
  v_vat_rate := CASE WHEN COALESCE(v_cust.billing_options,'') ILIKE '%vat%' THEN COALESCE(v_cust.vat_rate,0.20) ELSE 0 END;

  -- Calls
  SELECT COUNT(*), COALESCE(SUM(duration_seconds),0)
    INTO v_total_calls, v_total_call_seconds
  FROM public.call_logs cl
  WHERE cl.customer_id = p_customer_id
    AND cl.call_started_at >= v_period_start
    AND cl.call_started_at < (v_period_end + interval '1 day');

  v_included_calls := COALESCE(v_cust.call_base_allowance, 0);
  v_call_base := COALESCE(v_cust.call_monthly_charge, 0);

  IF COALESCE(v_cust.call_billing_unit, 'per_call') = 'per_minute' THEN
    v_overage_minutes := GREATEST(0, CEIL(v_total_call_seconds::numeric / 60) - COALESCE(v_cust.call_included_minutes,0));
    v_call_overage := v_overage_minutes * COALESCE(v_cust.call_rate_per_minute, 0);
  ELSE
    v_overage_calls := GREATEST(0, v_total_calls - v_included_calls);
    v_call_overage := v_overage_calls * COALESCE(v_cust.call_rate_per_call, 0);
  END IF;

  -- VA tasks (billable seconds for non-internal tasks updated in window)
  SELECT COALESCE(SUM(GREATEST(COALESCE(pt.time_spent, 0), 0)), 0)::int
    INTO v_total_va_seconds
  FROM public.project_tasks pt
  WHERE pt.customer_id = p_customer_id
    AND COALESCE(pt.is_internal, false) = false
    AND pt.updated_at >= v_period_start
    AND pt.updated_at < (v_period_end + interval '1 day');

  v_included_va_seconds := COALESCE(v_cust.va_packaged_hours, 0)::int * 3600;
  v_overage_va_seconds := GREATEST(0, v_total_va_seconds - v_included_va_seconds);
  v_va_base := COALESCE(v_cust.va_price, 0);
  v_va_overage := ROUND(((v_overage_va_seconds::numeric / 3600) * COALESCE(v_cust.va_hourly_overage_rate,0))::numeric, 2);

  v_subtotal := v_call_base + v_call_overage + v_va_base + v_va_overage + v_va_task;
  v_vat := ROUND(v_subtotal * v_vat_rate, 2);
  v_total := v_subtotal + v_vat;

  -- Check lock
  SELECT ii.status INTO v_existing_status
  FROM public.internal_billing_periods ibp
  JOIN public.internal_invoices ii ON ii.period_id = ibp.id
  WHERE ibp.customer_id = p_customer_id AND ibp.period_label = p_period_label;

  IF v_existing_status IS NOT NULL AND v_existing_status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice for this period is locked (status: %)', v_existing_status;
  END IF;

  -- Upsert period
  INSERT INTO public.internal_billing_periods (
    customer_id, period_label, period_start, period_end,
    total_calls, included_calls, overage_calls, total_call_seconds, overage_minutes,
    call_base_charge, call_overage_charge,
    total_va_seconds, included_va_seconds, overage_va_seconds,
    va_base_charge, va_overage_charge, va_task_charge,
    subtotal, vat_rate, vat_amount, total, status
  ) VALUES (
    p_customer_id, p_period_label, v_period_start, v_period_end,
    v_total_calls, v_included_calls, v_overage_calls, v_total_call_seconds, v_overage_minutes,
    v_call_base, v_call_overage,
    v_total_va_seconds, v_included_va_seconds, v_overage_va_seconds,
    v_va_base, v_va_overage, v_va_task,
    v_subtotal, v_vat_rate, v_vat, v_total, 'draft'
  )
  ON CONFLICT (customer_id, period_label) DO UPDATE SET
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    total_calls = EXCLUDED.total_calls,
    included_calls = EXCLUDED.included_calls,
    overage_calls = EXCLUDED.overage_calls,
    total_call_seconds = EXCLUDED.total_call_seconds,
    overage_minutes = EXCLUDED.overage_minutes,
    call_base_charge = EXCLUDED.call_base_charge,
    call_overage_charge = EXCLUDED.call_overage_charge,
    total_va_seconds = EXCLUDED.total_va_seconds,
    included_va_seconds = EXCLUDED.included_va_seconds,
    overage_va_seconds = EXCLUDED.overage_va_seconds,
    va_base_charge = EXCLUDED.va_base_charge,
    va_overage_charge = EXCLUDED.va_overage_charge,
    subtotal = EXCLUDED.subtotal,
    vat_rate = EXCLUDED.vat_rate,
    vat_amount = EXCLUDED.vat_amount,
    total = EXCLUDED.total,
    updated_at = now()
  RETURNING id INTO v_period_id;

  -- Upsert invoice
  SELECT id INTO v_invoice_id FROM public.internal_invoices WHERE period_id = v_period_id;

  IF v_invoice_id IS NULL THEN
    v_invoice_number := 'INT-' || replace(p_period_label,'-','') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);
    INSERT INTO public.internal_invoices (
      period_id, customer_id, invoice_number, customer_name, call_package_name, va_package_name,
      call_base_charge, call_overage_charge, va_base_charge, va_overage_charge, va_task_charge,
      subtotal, vat_rate, vat_amount, total, status
    ) VALUES (
      v_period_id, p_customer_id, v_invoice_number, v_cust.name, v_cust.call_package_name, v_cust.va_package,
      v_call_base, v_call_overage, v_va_base, v_va_overage, v_va_task,
      v_subtotal, v_vat_rate, v_vat, v_total, 'draft'
    ) RETURNING id INTO v_invoice_id;
  ELSE
    UPDATE public.internal_invoices SET
      customer_name = v_cust.name,
      call_package_name = v_cust.call_package_name,
      va_package_name = v_cust.va_package,
      call_base_charge = v_call_base,
      call_overage_charge = v_call_overage,
      va_base_charge = v_va_base,
      va_overage_charge = v_va_overage,
      va_task_charge = v_va_task,
      subtotal = v_subtotal,
      vat_rate = v_vat_rate,
      vat_amount = v_vat,
      total = v_total,
      updated_at = now()
    WHERE id = v_invoice_id;

    -- Clear and rewrite lines while draft
    DELETE FROM public.invoice_call_lines WHERE invoice_id = v_invoice_id;
    DELETE FROM public.invoice_va_lines WHERE invoice_id = v_invoice_id;
  END IF;

  -- Insert call line summaries
  IF v_call_base > 0 THEN
    INSERT INTO public.invoice_call_lines (invoice_id, description, duration_seconds, charge, is_overage)
    VALUES (v_invoice_id, COALESCE(v_cust.call_package_name,'Call Package') || ' (monthly)', 0, v_call_base, false);
  END IF;
  IF v_call_overage > 0 THEN
    INSERT INTO public.invoice_call_lines (invoice_id, description, duration_seconds, charge, is_overage)
    VALUES (v_invoice_id,
      CASE WHEN COALESCE(v_cust.call_billing_unit,'per_call') = 'per_minute'
           THEN 'Call overage: ' || v_overage_minutes || ' minutes'
           ELSE 'Call overage: ' || v_overage_calls || ' calls' END,
      v_total_call_seconds, v_call_overage, true);
  END IF;

  -- Insert VA line summaries
  IF v_va_base > 0 THEN
    INSERT INTO public.invoice_va_lines (invoice_id, description, billable_seconds, rate, charge, line_type)
    VALUES (v_invoice_id, COALESCE(v_cust.va_package,'VA Retainer'), 0, 0, v_va_base, 'retainer');
  END IF;
  IF v_va_overage > 0 THEN
    INSERT INTO public.invoice_va_lines (invoice_id, description, billable_seconds, rate, charge, line_type)
    VALUES (v_invoice_id,
      'VA overage: ' || ROUND(v_overage_va_seconds::numeric/3600, 2) || ' hrs',
      v_overage_va_seconds, COALESCE(v_cust.va_hourly_overage_rate,0), v_va_overage, 'overage');
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_internal_invoice_for_period(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_internal_invoice_for_period(uuid, text) TO authenticated, service_role;

-- 8) Bulk RPC: all active customers for a period
CREATE OR REPLACE FUNCTION public.generate_internal_invoices_for_period(p_period_label text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR r IN SELECT id FROM public.customers WHERE COALESCE(status,'Active') = 'Active' LOOP
    BEGIN
      PERFORM public.generate_internal_invoice_for_period(r.id, p_period_label);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- skip locked / errored customers
      NULL;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_internal_invoices_for_period(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_internal_invoices_for_period(text) TO authenticated, service_role;
