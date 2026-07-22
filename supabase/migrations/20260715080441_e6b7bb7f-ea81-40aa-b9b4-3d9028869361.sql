CREATE TABLE IF NOT EXISTS public.customer_mapping_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  mapping JSONB NOT NULL,
  form_template_id UUID REFERENCES public.form_templates(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_mapping_presets TO authenticated;
GRANT ALL ON public.customer_mapping_presets TO service_role;

ALTER TABLE public.customer_mapping_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can view mapping presets"
  ON public.customer_mapping_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert mapping presets"
  ON public.customer_mapping_presets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update mapping presets"
  ON public.customer_mapping_presets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth can delete mapping presets"
  ON public.customer_mapping_presets FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_customer_mapping_presets_customer
  ON public.customer_mapping_presets (customer_id, created_at DESC);

-- Enforce single default per customer
CREATE UNIQUE INDEX IF NOT EXISTS uniq_customer_mapping_default
  ON public.customer_mapping_presets (customer_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.customer_mapping_presets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_customer_mapping_presets_updated ON public.customer_mapping_presets;
CREATE TRIGGER trg_customer_mapping_presets_updated
  BEFORE UPDATE ON public.customer_mapping_presets
  FOR EACH ROW EXECUTE FUNCTION public.customer_mapping_presets_set_updated_at();

-- If a preset is marked default, clear the flag on any other preset for the same customer
CREATE OR REPLACE FUNCTION public.customer_mapping_presets_enforce_default()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.customer_mapping_presets
      SET is_default = false
      WHERE customer_id = NEW.customer_id
        AND id <> NEW.id
        AND is_default = true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_customer_mapping_presets_default ON public.customer_mapping_presets;
CREATE TRIGGER trg_customer_mapping_presets_default
  AFTER INSERT OR UPDATE OF is_default ON public.customer_mapping_presets
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.customer_mapping_presets_enforce_default();