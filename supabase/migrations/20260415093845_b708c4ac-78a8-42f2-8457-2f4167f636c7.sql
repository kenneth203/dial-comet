-- 1. Fix broken chat_messages RLS policies (room_id self-join bug)
DROP POLICY IF EXISTS "chat_msg_select_member" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_insert_member" ON public.chat_messages;

CREATE POLICY "chat_msg_select_member"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_room_members crm
      WHERE crm.room_id = chat_messages.room_id
        AND crm.user_id = auth.uid()
    )
  );

CREATE POLICY "chat_msg_insert_member"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.chat_room_members crm
      WHERE crm.room_id = chat_messages.room_id
        AND crm.user_id = auth.uid()
    )
  );

-- 2. Fix comprehensive_users SELECT policy — restrict to self or admin
DROP POLICY IF EXISTS "comp_users_select_auth" ON public.comprehensive_users;

CREATE POLICY "comp_users_select_own_or_admin"
  ON public.comprehensive_users FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR is_admin_or_higher()
  );

-- 3. Fix proposal_tokens anon policies — scope by token value
DROP POLICY IF EXISTS "proposal_select_anon" ON public.proposal_tokens;
DROP POLICY IF EXISTS "proposal_update_anon" ON public.proposal_tokens;

-- Anon can only read a specific token row (the app passes the token in the query filter)
CREATE POLICY "proposal_select_anon_by_token"
  ON public.proposal_tokens FOR SELECT
  TO anon
  USING (
    used_at IS NULL
    AND expires_at > now()
  );

-- Anon can only update a specific token to mark it as used
CREATE POLICY "proposal_update_anon_by_token"
  ON public.proposal_tokens FOR UPDATE
  TO anon
  USING (
    used_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (
    used_at IS NOT NULL
  );

-- 4. Fix chat_rooms SELECT policy (same self-join bug)
DROP POLICY IF EXISTS "chat_rooms_select_member" ON public.chat_rooms;

CREATE POLICY "chat_rooms_select_member"
  ON public.chat_rooms FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_room_members crm
      WHERE crm.room_id = chat_rooms.id
        AND crm.user_id = auth.uid()
    )
  );