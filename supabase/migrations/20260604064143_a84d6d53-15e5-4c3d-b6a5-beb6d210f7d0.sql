
CREATE OR REPLACE FUNCTION public.clear_chat_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this chat';
  END IF;

  DELETE FROM public.chat_messages WHERE room_id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_chat_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_chat_room(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_chat_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.chat_rooms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_room FROM public.chat_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this chat';
  END IF;

  IF v_room.type = 'general' THEN
    IF NOT (public.is_admin_or_higher() OR v_room.created_by = auth.uid()) THEN
      RAISE EXCEPTION 'Only admins or the creator can delete a channel';
    END IF;
  END IF;

  DELETE FROM public.chat_rooms WHERE id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_chat_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_chat_room(uuid) TO authenticated;
