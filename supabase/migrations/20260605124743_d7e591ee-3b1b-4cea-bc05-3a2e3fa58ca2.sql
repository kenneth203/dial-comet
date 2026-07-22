CREATE OR REPLACE FUNCTION public.is_chat_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_room_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_room_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view chat room members" ON public.chat_room_members;
DROP POLICY IF EXISTS "Authenticated users can view chat room members" ON public.chat_room_members;
DROP POLICY IF EXISTS "chat_room_members_select" ON public.chat_room_members;
DROP POLICY IF EXISTS "Select chat room members" ON public.chat_room_members;

CREATE POLICY "Members can view co-members"
  ON public.chat_room_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_chat_room_member(room_id)
    OR public.is_admin_or_higher()
  );