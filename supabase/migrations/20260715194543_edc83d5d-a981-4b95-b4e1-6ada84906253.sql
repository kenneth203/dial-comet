
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS source text;

CREATE TABLE IF NOT EXISTS public.email_intake_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  assignee_group uuid[] NOT NULL DEFAULT '{}',
  last_assigned_user_id uuid,
  default_status text NOT NULL DEFAULT 'To Do',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.email_intake_settings TO authenticated;
GRANT ALL ON public.email_intake_settings TO service_role;

ALTER TABLE public.email_intake_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_intake_settings_super_admin_select"
  ON public.email_intake_settings FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "email_intake_settings_super_admin_insert"
  ON public.email_intake_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "email_intake_settings_super_admin_update"
  ON public.email_intake_settings FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.email_intake_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS trg_email_intake_settings_updated_at ON public.email_intake_settings;
CREATE TRIGGER trg_email_intake_settings_updated_at
  BEFORE UPDATE ON public.email_intake_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.pick_next_email_assignee()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid[];
  v_last uuid;
  v_next uuid;
  v_idx int;
BEGIN
  SELECT assignee_group, last_assigned_user_id INTO v_group, v_last
    FROM public.email_intake_settings WHERE id = true FOR UPDATE;

  IF v_group IS NULL OR array_length(v_group, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  v_idx := COALESCE(array_position(v_group, v_last), 0);
  v_idx := (v_idx % array_length(v_group, 1)) + 1;
  v_next := v_group[v_idx];

  UPDATE public.email_intake_settings
    SET last_assigned_user_id = v_next
    WHERE id = true;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_next_email_assignee() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_next_email_assignee() TO service_role;
