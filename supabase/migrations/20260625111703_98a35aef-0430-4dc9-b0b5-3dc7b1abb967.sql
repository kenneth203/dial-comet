-- Make sure the existing typing channel uses the expected team-facing name
UPDATE public.chat_rooms
SET name = 'Typist', updated_at = now()
WHERE type = 'general'
  AND lower(coalesce(name, '')) IN ('typing', 'typist', 'tupist');

-- Ensure the required team-wide channels exist
INSERT INTO public.chat_rooms (name, type, created_by, is_private)
SELECT 'General', 'general', su.user_id, true
FROM public.system_users su
WHERE su.user_id IS NOT NULL
ORDER BY su.created_at NULLS LAST
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_rooms (name, type, created_by, is_private)
SELECT 'Typist', 'general', su.user_id, true
FROM public.system_users su
WHERE su.user_id IS NOT NULL
ORDER BY su.created_at NULLS LAST
LIMIT 1
ON CONFLICT DO NOTHING;

-- Current backfill: every active team user gets both required team-wide chat rooms
INSERT INTO public.chat_room_members (room_id, user_id)
SELECT r.id, su.user_id
FROM public.chat_rooms r
CROSS JOIN public.system_users su
WHERE r.type = 'general'
  AND lower(coalesce(r.name, '')) IN ('general', 'typist')
  AND su.user_id IS NOT NULL
  AND lower(coalesce(su.status, 'active')) = 'active'
ON CONFLICT (room_id, user_id) DO NOTHING;

-- Helper used by triggers and admin member updates to keep required channels team-wide
CREATE OR REPLACE FUNCTION public.ensure_required_team_chat_memberships()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_room_members (room_id, user_id)
  SELECT r.id, su.user_id
  FROM public.chat_rooms r
  CROSS JOIN public.system_users su
  WHERE r.type = 'general'
    AND lower(coalesce(r.name, '')) IN ('general', 'typist')
    AND su.user_id IS NOT NULL
    AND lower(coalesce(su.status, 'active')) = 'active'
  ON CONFLICT (room_id, user_id) DO NOTHING;
END;
$$;

-- Auto-add future and reactivated users to General and Typist
CREATE OR REPLACE FUNCTION public.add_user_to_general_chat_rooms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND lower(coalesce(NEW.status, 'active')) = 'active' THEN
    INSERT INTO public.chat_room_members (room_id, user_id)
    SELECT r.id, NEW.user_id
    FROM public.chat_rooms r
    WHERE r.type = 'general'
      AND lower(coalesce(r.name, '')) IN ('general', 'typist')
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_user_to_general_chat_rooms_ins ON public.system_users;
CREATE TRIGGER trg_add_user_to_general_chat_rooms_ins
AFTER INSERT ON public.system_users
FOR EACH ROW
EXECUTE FUNCTION public.add_user_to_general_chat_rooms();

DROP TRIGGER IF EXISTS trg_add_user_to_general_chat_rooms_upd ON public.system_users;
CREATE TRIGGER trg_add_user_to_general_chat_rooms_upd
AFTER UPDATE OF user_id, status ON public.system_users
FOR EACH ROW
WHEN (NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.add_user_to_general_chat_rooms();

-- If a required channel is renamed/created, immediately refill all active members
CREATE OR REPLACE FUNCTION public.refill_required_team_chat_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_required_team_chat_memberships();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refill_required_team_chat_memberships_rooms ON public.chat_rooms;
CREATE TRIGGER trg_refill_required_team_chat_memberships_rooms
AFTER INSERT OR UPDATE OF name, type ON public.chat_rooms
FOR EACH ROW
WHEN (NEW.type = 'general' AND lower(coalesce(NEW.name, '')) IN ('general', 'typist'))
EXECUTE FUNCTION public.refill_required_team_chat_memberships();

DROP TRIGGER IF EXISTS trg_refill_required_team_chat_memberships_members ON public.chat_room_members;
CREATE TRIGGER trg_refill_required_team_chat_memberships_members
AFTER DELETE ON public.chat_room_members
FOR EACH ROW
EXECUTE FUNCTION public.refill_required_team_chat_memberships();

-- Keep Super-Admin channel member edits from accidentally excluding active users on required team channels
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
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

  IF lower(coalesce(v_room.name, '')) IN ('general', 'typist') THEN
    PERFORM public.ensure_required_team_chat_memberships();
  END IF;
END;
$$;

-- Final backfill after all helpers are in place
SELECT public.ensure_required_team_chat_memberships();