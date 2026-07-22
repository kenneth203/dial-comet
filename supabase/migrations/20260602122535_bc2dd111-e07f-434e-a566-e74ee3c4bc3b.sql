
CREATE TABLE IF NOT EXISTS public.xero_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  tenant_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.xero_connection TO authenticated;
GRANT ALL ON public.xero_connection TO service_role;

ALTER TABLE public.xero_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view xero connection"
ON public.xero_connection FOR SELECT
TO authenticated
USING (public.is_admin_or_higher());

CREATE TRIGGER update_xero_connection_updated_at
BEFORE UPDATE ON public.xero_connection
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.internal_invoices
  ADD COLUMN IF NOT EXISTS xero_invoice_id text,
  ADD COLUMN IF NOT EXISTS xero_status text,
  ADD COLUMN IF NOT EXISTS xero_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS xero_last_error text;
