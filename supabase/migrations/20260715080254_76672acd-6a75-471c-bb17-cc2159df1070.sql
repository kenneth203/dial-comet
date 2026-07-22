CREATE TABLE IF NOT EXISTS public.customer_mapping_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  mapping JSONB NOT NULL,
  form_template_id UUID REFERENCES public.form_templates(id) ON DELETE SET NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.customer_mapping_versions TO authenticated;
GRANT ALL ON public.customer_mapping_versions TO service_role;

ALTER TABLE public.customer_mapping_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view mapping versions"
  ON public.customer_mapping_versions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert mapping versions"
  ON public.customer_mapping_versions FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Super-Admins can delete mapping versions"
  ON public.customer_mapping_versions FOR DELETE
  TO authenticated USING (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_customer_mapping_versions_customer_created
  ON public.customer_mapping_versions (customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.snapshot_customer_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.script_field_mappings IS DISTINCT FROM OLD.script_field_mappings
     AND NEW.script_field_mappings IS NOT NULL THEN
    INSERT INTO public.customer_mapping_versions (customer_id, mapping, source, created_by)
    VALUES (NEW.id, NEW.script_field_mappings, 'trigger', auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_customer_mapping ON public.customers;
CREATE TRIGGER trg_snapshot_customer_mapping
  AFTER UPDATE OF script_field_mappings ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_customer_mapping();

INSERT INTO public.customer_mapping_versions (customer_id, mapping, source, note)
SELECT c.id, c.script_field_mappings, 'trigger', 'Initial snapshot'
FROM public.customers c
WHERE c.script_field_mappings IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_mapping_versions v WHERE v.customer_id = c.id
  );