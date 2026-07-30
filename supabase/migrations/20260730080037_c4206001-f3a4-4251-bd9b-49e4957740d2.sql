-- ============ Item 5: unified invoice reporting ============
CREATE OR REPLACE VIEW public.invoices_unified AS
SELECT
  'crm'::text                                   AS source,
  pi.id                                         AS invoice_id,
  pi.invoice_number                             AS invoice_number,
  pi.customer_id                                AS customer_id,
  COALESCE(NULLIF(pi.company_name, ''), NULLIF(pi.client_name, ''), 'Unknown') AS customer_name,
  COALESCE(pi.issued_at, pi.created_at)::date   AS issued_date,
  pi.due_at::date                               AS due_date,
  to_char(COALESCE(pi.issued_at, pi.created_at), 'YYYY-MM') AS period_label,
  COALESCE(pi.subtotal, 0)                      AS subtotal,
  COALESCE(pi.vat_amount, 0)                    AS vat_amount,
  COALESCE(pi.total, 0)                         AS total,
  CASE
    WHEN lower(COALESCE(pi.status, '')) IN ('draft') THEN 'draft'
    WHEN lower(COALESCE(pi.status, '')) IN ('paid') THEN 'paid'
    WHEN lower(COALESCE(pi.status, '')) IN ('cancelled', 'canceled', 'void', 'voided') THEN 'cancelled'
    WHEN pi.due_at IS NOT NULL AND pi.due_at < now() THEN 'overdue'
    ELSE 'sent'
  END                                           AS status_normalised,
  pi.created_at                                 AS created_at
FROM public.proposal_invoices pi

UNION ALL

SELECT
  'billing'::text,
  ii.id,
  ii.invoice_number,
  ii.customer_id,
  COALESCE(NULLIF(ii.customer_name, ''), 'Unknown'),
  COALESCE(bp.period_end, ii.created_at::date),
  NULL::date,
  COALESCE(bp.period_label, to_char(ii.created_at, 'YYYY-MM')),
  COALESCE(ii.subtotal, 0),
  COALESCE(ii.vat_amount, 0),
  COALESCE(ii.total, 0),
  CASE
    WHEN lower(COALESCE(ii.status, '')) IN ('draft') THEN 'draft'
    WHEN lower(COALESCE(ii.status, '')) IN ('paid') THEN 'paid'
    WHEN lower(COALESCE(ii.status, '')) IN ('cancelled', 'canceled', 'void', 'voided') THEN 'cancelled'
    ELSE 'sent'
  END,
  ii.created_at
FROM public.internal_invoices ii
LEFT JOIN public.internal_billing_periods bp ON bp.id = ii.period_id

UNION ALL

SELECT
  'legacy_billing'::text,
  bi.invoice_id,
  NULL::text,
  bi.customer_id,
  COALESCE(NULLIF(bc.name, ''), 'Unknown'),
  COALESCE((bi.billing_period || '-01')::date, bi.created_on::date),
  NULL::date,
  bi.billing_period,
  COALESCE(bi.total_invoice, 0),
  GREATEST(COALESCE(bi.total_with_vat, 0) - COALESCE(bi.total_invoice, 0), 0),
  COALESCE(NULLIF(bi.total_with_vat, 0), bi.total_invoice, 0),
  'paid'::text,
  bi.created_on
FROM public.billing_invoices bi
LEFT JOIN public.billing_customers bc ON bc.customer_id = bi.customer_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.internal_invoices ii2
  JOIN public.internal_billing_periods bp2 ON bp2.id = ii2.period_id
  WHERE ii2.customer_id = bi.customer_id
    AND bp2.period_label = bi.billing_period
);

CREATE OR REPLACE FUNCTION public.get_invoice_report(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (
  source text,
  invoice_id uuid,
  invoice_number text,
  customer_id uuid,
  customer_name text,
  issued_date date,
  due_date date,
  period_label text,
  subtotal numeric,
  vat_amount numeric,
  total numeric,
  status_normalised text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.source, v.invoice_id, v.invoice_number, v.customer_id, v.customer_name,
         v.issued_date, v.due_date, v.period_label, v.subtotal, v.vat_amount,
         v.total, v.status_normalised, v.created_at
  FROM public.invoices_unified v
  WHERE public.has_billing_access()
    AND (p_from IS NULL OR v.issued_date >= p_from)
    AND (p_to IS NULL OR v.issued_date <= p_to)
  ORDER BY v.issued_date DESC NULLS LAST, v.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_report(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_report(date, date) TO service_role;

-- ============ Item 2: customer directory RPC ============
DROP VIEW IF EXISTS public.customer_directory;

CREATE OR REPLACE FUNCTION public.get_customer_directory()
RETURNS TABLE (id uuid, name text, status text, account_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.status, c.account_id
  FROM public.customers c
  WHERE auth.uid() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.get_customer_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_directory() TO service_role;

-- Hardening (from Live 20260730070557): the view runs with the querying
-- user's permissions and is not directly readable by clients.
ALTER VIEW public.invoices_unified SET (security_invoker = on);
REVOKE ALL ON public.invoices_unified FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoices_unified TO service_role;