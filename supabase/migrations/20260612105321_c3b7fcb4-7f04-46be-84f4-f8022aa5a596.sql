DROP POLICY IF EXISTS form_tmpl_select_anon ON public.form_templates;
REVOKE SELECT ON public.form_templates FROM anon;