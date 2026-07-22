ALTER TABLE public.form_templates ADD COLUMN IF NOT EXISTS field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS script_field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.form_templates.field_mappings IS 'Default per-form field mapping used by the customer script importer.';
COMMENT ON COLUMN public.customers.script_field_mappings IS 'Per-customer override of form-field-to-script mappings, learned from the first import and editable later.';