
CREATE TABLE public.email_template_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL UNIQUE,
  subject text NOT NULL,
  body_text text NOT NULL,
  signature_text text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.email_template_content TO authenticated;
GRANT ALL ON public.email_template_content TO service_role;

ALTER TABLE public.email_template_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_template_content_select_auth"
  ON public.email_template_content
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "email_template_content_insert_superadmin"
  ON public.email_template_content
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "email_template_content_update_superadmin"
  ON public.email_template_content
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.email_template_content_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_email_template_content_updated_at
  BEFORE UPDATE ON public.email_template_content
  FOR EACH ROW EXECUTE FUNCTION public.email_template_content_set_updated_at();

INSERT INTO public.email_template_content (template_name, subject, body_text, signature_text)
VALUES (
  'lead-introduction',
  'An introduction to The VA Team — tailored call answering & admin support',
  E'I hope you''re well.\n\n'
  'I wanted to introduce The VA Team. We are not your normal call answering service. We provide tailored customer service, call handling, diary support and admin solutions built around the way your business works.\n\n'
  'Whether you need help answering calls, booking appointments, managing enquiries, supporting your team during busy periods, or making sure no opportunity is missed, we create a service that fits your business rather than forcing you into a standard package.\n\n'
  'For clinics, our first three booking packages are:\n'
  '- Starter 25: 25 calls from £99 + VAT per month\n'
  '- Business 40: 40 calls from £150 + VAT per month\n'
  '- Professional 60: 60 calls from £195 + VAT per month\n\n'
  'Packages are fully scalable, so we can increase or adjust your support as your business grows or your call volume changes.\n\n'
  'Would you be open to a short discovery call? It would be a chance to understand your business, your current challenges and how The VA Team could support you.\n\n'
  'You can reply directly to this email at info@thevateam.co.uk and one of our team will come straight back to you.',
  E'Yours sincerely,\n'
  'Kenneth Pote\n'
  'The VA Team Limited\n'
  'Phone: 0203 474 0859\n'
  'Email: info@thevateam.co.uk\n'
  'Website: https://www.thevateam.co.uk'
)
ON CONFLICT (template_name) DO NOTHING;
