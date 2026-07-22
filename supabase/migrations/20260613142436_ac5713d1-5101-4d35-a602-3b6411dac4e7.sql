
CREATE OR REPLACE FUNCTION public.create_private_channel(p_name text, p_member_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_room_id uuid;
  v_uid uuid;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Channel name is required';
  END IF;

  INSERT INTO public.chat_rooms (name, type, created_by, is_private)
  VALUES (v_name, 'general', v_caller, true)
  RETURNING id INTO v_room_id;

  INSERT INTO public.chat_room_members (room_id, user_id)
  VALUES (v_room_id, v_caller)
  ON CONFLICT DO NOTHING;

  IF p_member_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_member_ids LOOP
      IF v_uid IS NOT NULL AND v_uid <> v_caller THEN
        INSERT INTO public.chat_room_members (room_id, user_id)
        VALUES (v_room_id, v_uid)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_channel_members(p_room_id uuid, p_member_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.chat_rooms;
  v_uid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_room FROM public.chat_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Channel not found'; END IF;
  IF v_room.type <> 'general' THEN
    RAISE EXCEPTION 'Cannot manage members on a direct message';
  END IF;

  DELETE FROM public.chat_room_members
  WHERE room_id = p_room_id
    AND user_id IS DISTINCT FROM v_room.created_by;

  IF p_member_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_member_ids LOOP
      IF v_uid IS NOT NULL THEN
        INSERT INTO public.chat_room_members (room_id, user_id)
        VALUES (p_room_id, v_uid)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_channel(p_room_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Channel name is required';
  END IF;
  UPDATE public.chat_rooms
    SET name = v_name, updated_at = now()
  WHERE id = p_room_id AND type = 'general';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_channel_members(p_room_id uuid)
RETURNS TABLE(user_id uuid, name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_super_admin() AND NOT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = p_room_id AND chat_room_members.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT crm.user_id, COALESCE(su.name, 'Unknown User') AS name
  FROM public.chat_room_members crm
  LEFT JOIN public.system_users su ON su.user_id = crm.user_id
  WHERE crm.room_id = p_room_id
  ORDER BY name;
END;
$$;
