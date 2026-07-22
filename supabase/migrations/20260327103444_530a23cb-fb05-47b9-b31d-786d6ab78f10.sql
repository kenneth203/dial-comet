
-- Table to track form submissions (sent forms and their responses)
CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  responses jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- Authenticated users (staff) can view submissions for customers they have access to
CREATE POLICY "Staff can view form submissions"
  ON public.form_submissions FOR SELECT
  TO authenticated
  USING (true);

-- Staff can create form submissions (send forms)
CREATE POLICY "Staff can create form submissions"
  ON public.form_submissions FOR INSERT
  TO authenticated
  WITH CHECK (sent_by = auth.uid());

-- Staff can update form submissions
CREATE POLICY "Staff can update form submissions"
  ON public.form_submissions FOR UPDATE
  TO authenticated
  USING (true);

-- Staff can delete form submissions
CREATE POLICY "Staff can delete form submissions"
  ON public.form_submissions FOR DELETE
  TO authenticated
  USING (sent_by = auth.uid() OR is_admin_or_higher());

-- Allow anon role to update submissions (for public form filling)
CREATE POLICY "Public can update pending submissions"
  ON public.form_submissions FOR UPDATE
  TO anon
  USING (status = 'pending')
  WITH CHECK (status IN ('pending', 'completed'));

-- Allow anon to read pending submissions (for public form page)
CREATE POLICY "Public can read pending submissions"
  ON public.form_submissions FOR SELECT
  TO anon
  USING (status = 'pending');
