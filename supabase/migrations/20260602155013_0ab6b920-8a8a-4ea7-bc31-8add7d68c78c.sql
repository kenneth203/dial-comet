CREATE TABLE public.customer_script_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view','edit')),
  old_script text,
  new_script text,
  old_tags jsonb,
  new_tags jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_csa_customer ON public.customer_script_audit(customer_id, created_at DESC);
CREATE INDEX idx_csa_user ON public.customer_script_audit(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.customer_script_audit TO authenticated;
GRANT ALL ON public.customer_script_audit TO service_role;

ALTER TABLE public.customer_script_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY csa_insert_own ON public.customer_script_audit
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY csa_select_admin ON public.customer_script_audit
  FOR SELECT TO authenticated
  USING (is_admin_or_higher());
