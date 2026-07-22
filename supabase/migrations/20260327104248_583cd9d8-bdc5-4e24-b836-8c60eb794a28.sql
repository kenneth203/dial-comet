
-- Fix overly permissive UPDATE/SELECT policies for authenticated users
DROP POLICY "Staff can view form submissions" ON public.form_submissions;
DROP POLICY "Staff can update form submissions" ON public.form_submissions;

-- Staff can view submissions they sent or are admin
CREATE POLICY "Staff can view form submissions"
  ON public.form_submissions FOR SELECT
  TO authenticated
  USING (sent_by = auth.uid() OR is_admin_or_higher());

-- Staff can update submissions they sent or are admin
CREATE POLICY "Staff can update form submissions"
  ON public.form_submissions FOR UPDATE
  TO authenticated
  USING (sent_by = auth.uid() OR is_admin_or_higher());
