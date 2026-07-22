
CREATE TABLE public.email_intake_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type text NOT NULL CHECK (match_type IN ('email','name_contains','domain')),
  match_value text NOT NULL,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  assignee_id uuid NULL REFERENCES public.system_users(id) ON DELETE SET NULL,
  task_status text NOT NULL DEFAULT 'To Do',
  task_priority text NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_intake_rules TO authenticated;
GRANT ALL ON public.email_intake_rules TO service_role;

ALTER TABLE public.email_intake_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super-Admin manages intake rules"
ON public.email_intake_rules
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE TRIGGER update_email_intake_rules_updated_at
BEFORE UPDATE ON public.email_intake_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX email_intake_rules_enabled_sort_idx
ON public.email_intake_rules (enabled, sort_order);

ALTER TABLE public.inbound_email_log
ADD COLUMN IF NOT EXISTS matched_rule_id uuid NULL REFERENCES public.email_intake_rules(id) ON DELETE SET NULL;
