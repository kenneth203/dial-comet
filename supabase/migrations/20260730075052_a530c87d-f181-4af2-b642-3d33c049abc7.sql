CREATE OR REPLACE FUNCTION public.mark_chat_room_read(p_room_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_room_members crm
    WHERE crm.room_id = p_room_id
      AND crm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this chat room';
  END IF;

  INSERT INTO public.chat_message_reads (message_id, user_id)
  SELECT cm.id, auth.uid()
  FROM public.chat_messages cm
  WHERE cm.room_id = p_room_id
    AND cm.sender_id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.chat_message_reads cmr
      WHERE cmr.message_id = cm.id
        AND cmr.user_id = auth.uid()
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_chat_unread_counts()
RETURNS TABLE(room_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT crm.room_id, COUNT(cm.id)::bigint AS unread_count
  FROM public.chat_room_members crm
  LEFT JOIN public.chat_messages cm
    ON cm.room_id = crm.room_id
   AND cm.sender_id <> auth.uid()
   AND NOT EXISTS (
     SELECT 1
     FROM public.chat_message_reads cmr
     WHERE cmr.message_id = cm.id
       AND cmr.user_id = auth.uid()
   )
  WHERE crm.user_id = auth.uid()
  GROUP BY crm.room_id
$$;

REVOKE EXECUTE ON FUNCTION public.mark_chat_room_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_chat_unread_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_chat_room_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_unread_counts() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_sender_id ON public.chat_messages (room_id, sender_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user_message ON public.chat_message_reads (user_id, message_id);