
-- 1) Return every active person for chat (even if they don't have an auth account yet)
--    We use comprehensive_users because it already consolidates names/emails/status.
--    can_message = TRUE only when an auth_user_id exists (so we have someone to DM).
CREATE OR REPLACE FUNCTION public.get_dm_candidates()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  can_message boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cu.auth_user_id AS user_id,
    cu.name,
    cu.email,
    (cu.auth_user_id IS NOT NULL) AS can_message
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active'
    AND (cu.auth_user_id IS NULL OR cu.auth_user_id <> auth.uid())
  ORDER BY cu.name;
$$;

-- 2) Create/find a DM room safely server-side under RLS
--    This prevents "new row violates row-level security" errors and ensures both members are added atomically.
CREATE OR REPLACE FUNCTION public.create_direct_message_room(target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  existing_room_id uuid;
  new_room_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF target_user_id = current_user_id THEN
    RAISE EXCEPTION 'Cannot create a DM with yourself';
  END IF;

  -- Look for an existing DM room with both members
  SELECT m.room_id
  INTO existing_room_id
  FROM public.chat_room_members m
  JOIN public.chat_rooms r ON r.id = m.room_id
  WHERE r.type = 'dm'
    AND m.user_id = current_user_id
    AND EXISTS (
      SELECT 1
      FROM public.chat_room_members m2
      WHERE m2.room_id = m.room_id
        AND m2.user_id = target_user_id
    )
  LIMIT 1;

  IF existing_room_id IS NOT NULL THEN
    RETURN existing_room_id;
  END IF;

  -- Create the DM room
  INSERT INTO public.chat_rooms (name, type, created_by)
  VALUES ('Direct Message', 'dm', current_user_id)
  RETURNING id INTO new_room_id;

  -- Add both users as members
  INSERT INTO public.chat_room_members (room_id, user_id)
  VALUES (new_room_id, current_user_id),
         (new_room_id, target_user_id);

  RETURN new_room_id;
END;
$$;
