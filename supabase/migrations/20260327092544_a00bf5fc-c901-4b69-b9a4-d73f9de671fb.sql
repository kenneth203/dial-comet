
CREATE TABLE public.form_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  form_type text NOT NULL DEFAULT 'lead_capture',
  elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  brand_color text NOT NULL DEFAULT '#1a2332',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view form templates"
  ON public.form_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert form templates"
  ON public.form_templates FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creator or admin can update form templates"
  ON public.form_templates FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR is_admin_or_higher());

CREATE POLICY "Creator or admin can delete form templates"
  ON public.form_templates FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR is_admin_or_higher());
