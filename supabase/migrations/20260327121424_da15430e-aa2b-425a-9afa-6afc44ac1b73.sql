-- Remove overly permissive anon policies
DROP POLICY IF EXISTS "Public can read pending submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Public can update pending submissions" ON public.form_submissions;