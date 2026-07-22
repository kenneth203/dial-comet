-- Add Direct Dial Number flag to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS direct_dial_number boolean NOT NULL DEFAULT false;

-- Update internal invoice generator to include £12.00 Direct Dial line when enabled
CREATE OR REPLACE FUNCTION public.generate_internal_invoice_for_period(p_customer_id uuid, p_period_label text)
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
  v_vat_rate numeric := 0;
  v_total_calls int := 0;
  v_total_call_seconds int := 0;
  v_included_calls int := 0;
  v_overage_calls int := 0;
  v_overage_minutes int := 0;
  v_call_base numeric := 0;
  v_call_overage numeric := 0;
  v_direct_dial_charge numeric := 0;
  v_total_va_seconds int := 0;
  v_included_va_seconds int := 0;
  v_overage_va_seconds int := 0;
  v_va_base numeric := 0;
  v_va_overage numeric := 0;
  v_va_task numeric := 0;
  v_subtotal numeric := 0;
  v_vat numeric := 0;
  v_total numeric := 0;
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

  v_year := split_part(p_period_label, '-', 1)::int;
  v_month := split_part(p_period_label, '-', 2)::int;
  v_billing_day := LEAST(GREATEST(COALESCE(EXTRACT(DAY FROM v_cust.billing_day)::int, 1), 1), 28);
  v_period_start := make_date(v_year, v_month, v_billing_day);
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

  v_vat_rate := CASE WHEN COALESCE(v_cust.billing_options,'') ILIKE '%vat%' THEN COALESCE(v_cust.vat_rate,0.20) ELSE 0 END;

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

  IF COALESCE(v_cust.direct_dial_number, false) THEN
    v_direct_dial_charge := 12.00;
  END IF;

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

  v_subtotal := v_call_base + v_call_overage + v_direct_dial_charge + v_va_base + v_va_overage + v_va_task;
  v_vat := ROUND(v_subtotal * v_vat_rate, 2);
  v_total := v_subtotal + v_vat;

  SELECT ii.status INTO v_existing_status
  FROM public.internal_billing_periods ibp
  JOIN public.internal_invoices ii ON ii.period_id = ibp.id
  WHERE ibp.customer_id = p_customer_id AND ibp.period_label = p_period_label;

  IF v_existing_status IS NOT NULL AND v_existing_status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice for this period is locked (status: %)', v_existing_status;
  END IF;

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
    v_call_base + v_direct_dial_charge, v_call_overage,
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

  SELECT id INTO v_invoice_id FROM public.internal_invoices WHERE period_id = v_period_id;

  IF v_invoice_id IS NULL THEN
    v_invoice_number := 'INT-' || replace(p_period_label,'-','') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);
    INSERT INTO public.internal_invoices (
      period_id, customer_id, invoice_number, customer_name, call_package_name, va_package_name,
      call_base_charge, call_overage_charge, va_base_charge, va_overage_charge, va_task_charge,
      subtotal, vat_rate, vat_amount, total, status
    ) VALUES (
      v_period_id, p_customer_id, v_invoice_number, v_cust.name, v_cust.call_package_name, v_cust.va_package,
      v_call_base + v_direct_dial_charge, v_call_overage, v_va_base, v_va_overage, v_va_task,
      v_subtotal, v_vat_rate, v_vat, v_total, 'draft'
    ) RETURNING id INTO v_invoice_id;
  ELSE
    UPDATE public.internal_invoices SET
      customer_name = v_cust.name,
      call_package_name = v_cust.call_package_name,
      va_package_name = v_cust.va_package,
      call_base_charge = v_call_base + v_direct_dial_charge,
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

    DELETE FROM public.invoice_call_lines WHERE invoice_id = v_invoice_id;
    DELETE FROM public.invoice_va_lines WHERE invoice_id = v_invoice_id;
  END IF;

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
  IF v_direct_dial_charge > 0 THEN
    INSERT INTO public.invoice_call_lines (invoice_id, description, duration_seconds, charge, is_overage)
    VALUES (v_invoice_id, 'Direct Dial Number - Purchasing/Hosting', 0, v_direct_dial_charge, false);
  END IF;

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