
CREATE TABLE IF NOT EXISTS public.chat_message_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  room_id uuid,
  message_sender_id uuid,
  message_content text,
  attachment_count integer NOT NULL DEFAULT 0,
  deleted_by uuid NOT NULL,
  deleted_by_email text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_message_deletion_audit TO authenticated;
GRANT ALL ON public.chat_message_deletion_audit TO service_role;

ALTER TABLE public.chat_message_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super-Admin can view chat deletion audit" ON public.chat_message_deletion_audit;
CREATE POLICY "Super-Admin can view chat deletion audit"
ON public.chat_message_deletion_audit
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_chat_msg_del_audit_deleted_at ON public.chat_message_deletion_audit (deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_del_audit_deleted_by ON public.chat_message_deletion_audit (deleted_by);

CREATE OR REPLACE FUNCTION public.delete_chat_message(_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _room_id uuid;
  _sender_id uuid;
  _content text;
  _attach_count integer := 0;
  _actor_email text;
BEGIN
  IF NOT COALESCE(public.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Only Super-Admin can delete chat messages';
  END IF;

  SELECT room_id, sender_id, content INTO _room_id, _sender_id, _content
  FROM public.chat_messages WHERE id = _message_id;

  SELECT count(*) INTO _attach_count FROM public.chat_attachments WHERE message_id = _message_id;
  SELECT email INTO _actor_email FROM auth.users WHERE id = _actor;

  INSERT INTO public.chat_message_deletion_audit
    (message_id, room_id, message_sender_id, message_content, attachment_count, deleted_by, deleted_by_email)
  VALUES
    (_message_id, _room_id, _sender_id, _content, COALESCE(_attach_count, 0), _actor, _actor_email);

  DELETE FROM public.chat_message_reactions WHERE message_id = _message_id;
  DELETE FROM public.chat_message_reads WHERE message_id = _message_id;
  DELETE FROM public.chat_message_deliveries WHERE message_id = _message_id;
  DELETE FROM public.chat_attachments WHERE message_id = _message_id;
  DELETE FROM public.chat_messages WHERE id = _message_id;
  RETURN true;
END;
$function$;
