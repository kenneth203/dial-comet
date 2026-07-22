
-- 1. New permission row
INSERT INTO public.app_permissions (section, feature, icon, description)
VALUES ('customer_directory', 'contact_ooo_edit', 'CalendarOff',
        'Set or clear Out of Office on a customer contact from the inbound call script')
ON CONFLICT DO NOTHING;

-- Default grants: enable for Operator + Admin + Supervisor + Manager + Super-Admin
WITH p AS (
  SELECT id FROM public.app_permissions
   WHERE section='customer_directory' AND feature='contact_ooo_edit'
)
INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
SELECT p.id, r, true, 'all'
FROM p, unnest(ARRAY['Super-Admin','Supervisor','Admin','Manager','Operator']) r
ON CONFLICT (permission_id, role) DO UPDATE
  SET granted = EXCLUDED.granted, scope = EXCLUDED.scope, updated_at = now();

-- 2. Extend customer_script_audit
ALTER TABLE public.customer_script_audit
  DROP CONSTRAINT IF EXISTS customer_script_audit_action_check;

ALTER TABLE public.customer_script_audit
  ADD CONSTRAINT customer_script_audit_action_check
  CHECK (action = ANY (ARRAY['view'::text,'edit'::text,'ooo_set'::text,'ooo_clear'::text]));

ALTER TABLE public.customer_script_audit
  ADD COLUMN IF NOT EXISTS contact_label text,
  ADD COLUMN IF NOT EXISTS ooo_reason text,
  ADD COLUMN IF NOT EXISTS ooo_from date,
  ADD COLUMN IF NOT EXISTS ooo_until date;

-- 3. Secure RPC: update only the OOO fields of one contact
CREATE OR REPLACE FUNCTION public.update_customer_contact_ooo(
  p_customer_id uuid,
  p_contact_id  text,
  p_reason      text,
  p_from        date,
  p_until       date
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      text;
  v_contacts  jsonb;
  v_new       jsonb;
  v_found     boolean := false;
  v_label     text;
  v_action    text;
  v_is_clear  boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_role := public.get_current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('Super-Admin','Supervisor','Admin','Manager','Operator') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT contacts INTO v_contacts
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF v_contacts IS NULL THEN
    v_contacts := '[]'::jsonb;
  END IF;

  v_is_clear := (p_reason IS NULL OR btrim(p_reason) = '')
                AND p_from IS NULL AND p_until IS NULL;

  -- Rebuild contacts array, patching the targeted contact
  SELECT jsonb_agg(
           CASE
             WHEN (c->>'id') = p_contact_id THEN
               CASE WHEN v_is_clear THEN
                 (c - 'oooReason' - 'oooFromDate' - 'oooUntilDate')
               ELSE
                 c
                   || jsonb_build_object('oooReason', p_reason)
                   || jsonb_build_object('oooFromDate', to_char(p_from, 'YYYY-MM-DD'))
                   || jsonb_build_object('oooUntilDate', to_char(p_until, 'YYYY-MM-DD'))
               END
             ELSE c
           END
         ),
         bool_or((c->>'id') = p_contact_id),
         max(CASE WHEN (c->>'id') = p_contact_id
                  THEN btrim(coalesce(c->>'firstName','') || ' ' || coalesce(c->>'surname','')) END)
    INTO v_new, v_found, v_label
  FROM jsonb_array_elements(v_contacts) c;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  UPDATE public.customers
     SET contacts   = COALESCE(v_new, '[]'::jsonb),
         updated_at = now()
   WHERE id = p_customer_id;

  v_action := CASE WHEN v_is_clear THEN 'ooo_clear' ELSE 'ooo_set' END;

  INSERT INTO public.customer_script_audit
    (customer_id, user_id, action, contact_label, ooo_reason, ooo_from, ooo_until)
  VALUES
    (p_customer_id, auth.uid(), v_action, NULLIF(v_label,''),
     CASE WHEN v_is_clear THEN NULL ELSE p_reason END,
     CASE WHEN v_is_clear THEN NULL ELSE p_from   END,
     CASE WHEN v_is_clear THEN NULL ELSE p_until  END);

  RETURN COALESCE(v_new, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_customer_contact_ooo(uuid,text,text,date,date)
  TO authenticated;
