
ALTER TABLE public.email_template_content
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS category text;

DROP POLICY IF EXISTS "email_template_content_delete_superadmin" ON public.email_template_content;
CREATE POLICY "email_template_content_delete_superadmin"
  ON public.email_template_content
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

UPDATE public.email_template_content
SET category = 'lead-introduction',
    display_label = COALESCE(display_label, 'Clinics — Call answering intro')
WHERE template_name = 'lead-introduction';

INSERT INTO public.email_template_content (template_name, category, display_label, subject, body_text, signature_text)
VALUES (
  'lead-introduction-va',
  'lead-introduction',
  'Virtual Assistant services intro',
  'An introduction to The VA Team — flexible Virtual Assistant support',
  E'I hope you''re well.\n\n'
  'I wanted to introduce The VA Team. We provide flexible Virtual Assistant support designed around how your business actually runs — not a one-size-fits-all package.\n\n'
  'Our Virtual Assistants can take care of inbox management, diary and appointment scheduling, document preparation, client follow-ups, CRM updates, research, travel arrangements, supplier coordination and the day-to-day admin that quietly eats into your week.\n\n'
  'Typical Virtual Assistant packages start from:\n'
  '- VA Starter 10: 10 hours from £295 + VAT per month\n'
  '- VA Business 20: 20 hours from £575 + VAT per month\n'
  '- VA Professional 40: 40 hours from £1,095 + VAT per month\n\n'
  'Hours roll forward within the month and packages can scale up or down as your workload changes, so you only pay for the support you actually need.\n\n'
  'Would you be open to a short [discovery call](https://calendar.app.google/YrNFetLnzNej3P5q9)? It would be a chance to understand your business, the tasks taking up your time, and how a dedicated VA from The VA Team could support you.\n\n'
  'You can reply directly to this email at info@thevateam.co.uk and one of our team will come straight back to you.',
  E'Yours sincerely,\n'
  'Kenneth Pote\n'
  'The VA Team Limited\n'
  'Phone: 0203 474 0859\n'
  'Email: info@thevateam.co.uk\n'
  'Website: https://www.thevateam.co.uk'
)
ON CONFLICT (template_name) DO NOTHING;
