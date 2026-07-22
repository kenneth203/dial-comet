CREATE TABLE public.proposal_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  proposal_token_id UUID,
  invoice_number TEXT NOT NULL UNIQUE,
  service_type TEXT NOT NULL,
  package_name TEXT NOT NULL,
  package_price NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_rate NUMERIC NOT NULL DEFAULT 0.20,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  client_name TEXT,
  company_name TEXT,
  client_address TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_invoices TO authenticated;
GRANT ALL ON public.proposal_invoices TO service_role;

ALTER TABLE public.proposal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prop_inv_select_auth"
ON public.proposal_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "prop_inv_insert_admin"
ON public.proposal_invoices FOR INSERT TO authenticated
WITH CHECK (is_admin_or_higher());

CREATE POLICY "prop_inv_update_admin"
ON public.proposal_invoices FOR UPDATE TO authenticated
USING (is_admin_or_higher());

CREATE POLICY "prop_inv_delete_admin"
ON public.proposal_invoices FOR DELETE TO authenticated
USING (is_admin_or_higher());

CREATE INDEX idx_proposal_invoices_customer ON public.proposal_invoices(customer_id);
CREATE INDEX idx_proposal_invoices_status ON public.proposal_invoices(status);

CREATE TRIGGER update_proposal_invoices_updated_at
BEFORE UPDATE ON public.proposal_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();