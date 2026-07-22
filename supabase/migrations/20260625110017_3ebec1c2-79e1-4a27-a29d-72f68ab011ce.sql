
-- Backfill: ensure every active system user is a member of the General room
INSERT INTO public.chat_room_members (room_id, user_id)
SELECT '16e869a1-ed5e-4b12-8c6c-3add281f8b01'::uuid, su.user_id
FROM public.system_users su
WHERE su.user_id IS NOT NULL
  AND su.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.chat_room_members m
    WHERE m.room_id = '16e869a1-ed5e-4b12-8c6c-3add281f8b01'::uuid
      AND m.user_id = su.user_id
  );

-- Auto-add future users to all 'general' type rooms
CREATE OR REPLACE FUNCTION public.add_user_to_general_chat_rooms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND (NEW.status IS NULL OR NEW.status = 'active') THEN
    INSERT INTO public.chat_room_members (room_id, user_id)
    SELECT r.id, NEW.user_id
    FROM public.chat_rooms r
    WHERE r.type = 'general'
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_room_members m
        WHERE m.room_id = r.id AND m.user_id = NEW.user_id
      );
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
WHEN (NEW.user_id IS NOT NULL AND (NEW.status IS NULL OR NEW.status = 'active'))
EXECUTE FUNCTION public.add_user_to_general_chat_rooms();
