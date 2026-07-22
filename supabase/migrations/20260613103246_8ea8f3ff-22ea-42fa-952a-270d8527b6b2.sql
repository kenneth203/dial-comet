ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_templates_customer_id
  ON public.checklist_templates(customer_id);