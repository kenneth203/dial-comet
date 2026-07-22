CREATE OR REPLACE FUNCTION public.delete_chat_message(_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super boolean;
BEGIN
  SELECT public.has_role(auth.uid(), 'Super-Admin'::app_role) INTO _is_super;
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

GRANT EXECUTE ON FUNCTION public.delete_chat_message(uuid) TO authenticated;