
-- Remove all members from Typist except Rowena, Kate, Kenneth
DELETE FROM public.chat_room_members
WHERE room_id = 'eed5904b-087d-4e1b-9e19-15ef7df4bddc'
  AND user_id NOT IN (
    '3321f247-60a3-475f-85bf-a024f03714b5', -- Kenneth Pote
    '2ce7ac0b-34a3-456a-93d3-f1ddeaa70010', -- Kate Campbell
    '6289794a-c8ca-4bd9-b735-d9a259d2c364'  -- Rowena Harrison
  );

-- Update trigger: only auto-add new users to General, never to Typist
CREATE OR REPLACE FUNCTION public.add_user_to_general_chat_rooms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NOT NULL AND lower(coalesce(NEW.status, 'active')) = 'active' THEN
    INSERT INTO public.chat_room_members (room_id, user_id)
    SELECT r.id, NEW.user_id
    FROM public.chat_rooms r
    WHERE r.type = 'general'
      AND lower(coalesce(r.name, '')) = 'general'
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
