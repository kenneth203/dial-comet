
CREATE TABLE public.script_import_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  source_type TEXT NOT NULL,
  source_name TEXT,
  source_size INTEGER,
  source_text_preview TEXT,
  applied_mode TEXT NOT NULL DEFAULT 'replace',
  old_script TEXT,
  new_script TEXT,
  customer_updates JSONB NOT NULL DEFAULT '{}'::jsonb,
  quick_ref_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  ocr_used BOOLEAN NOT NULL DEFAULT false,
  ocr_avg_confidence NUMERIC(5,2),
  pages_processed INTEGER,
  template_id UUID,
  submission_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_script_import_audit_customer ON public.script_import_audit(customer_id, created_at DESC);
CREATE INDEX idx_script_import_audit_user ON public.script_import_audit(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.script_import_audit TO authenticated;
GRANT ALL ON public.script_import_audit TO service_role;

ALTER TABLE public.script_import_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sia_insert_own"
  ON public.script_import_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sia_select_admin"
  ON public.script_import_audit
  FOR SELECT
  TO authenticated
  USING (is_admin_or_higher());
