-- Fix 1: delete_chat_message casts to non-existent app_role enum
CREATE OR REPLACE FUNCTION public.delete_chat_message(_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean;
BEGIN
  SELECT public.has_role(auth.uid(), 'Super-Admin'::public.user_role) INTO _is_super;
  IF NOT COALESCE(_is_super, false) THEN
    RAISE EXCEPTION 'Only Super-Admin can delete chat messages';
  END IF;

  DELETE FROM public.chat_message_reactions WHERE message_id = _message_id;
  DELETE FROM public.chat_message_reads WHERE message_id = _message_id;
  DELETE FROM public.chat_message_deliveries WHERE message_id = _message_id;
  DELETE FROM public.chat_attachments WHERE message_id = _message_id;
  DELETE FROM public.chat_messages WHERE id = _message_id;
  RETURN true;
END;
$$;

-- Fix 3: allow Admin (not just Super-Admin) to manage Dictation Intake settings and rules
DROP POLICY IF EXISTS "email_intake_settings_super_admin_select" ON public.email_intake_settings;
DROP POLICY IF EXISTS "email_intake_settings_super_admin_insert" ON public.email_intake_settings;
DROP POLICY IF EXISTS "email_intake_settings_super_admin_update" ON public.email_intake_settings;

CREATE POLICY "email_intake_settings_admin_select"
  ON public.email_intake_settings FOR SELECT TO authenticated
  USING (public.is_admin_or_higher());

CREATE POLICY "email_intake_settings_admin_insert"
  ON public.email_intake_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_higher());

CREATE POLICY "email_intake_settings_admin_update"
  ON public.email_intake_settings FOR UPDATE TO authenticated
  USING (public.is_admin_or_higher())
  WITH CHECK (public.is_admin_or_higher());

DROP POLICY IF EXISTS "email_intake_rules_super_admin_all" ON public.email_intake_rules;

CREATE POLICY "email_intake_rules_admin_all"
  ON public.email_intake_rules FOR ALL TO authenticated
  USING (public.is_admin_or_higher())
  WITH CHECK (public.is_admin_or_higher());
