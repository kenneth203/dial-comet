
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.chat_message_reactions TO authenticated;
GRANT ALL ON public.chat_message_reactions TO service_role;

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view reactions in their rooms"
  ON public.chat_message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      JOIN public.chat_room_members crm ON crm.room_id = m.room_id
      WHERE m.id = chat_message_reactions.message_id
        AND crm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can add their own reactions"
  ON public.chat_message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      JOIN public.chat_room_members crm ON crm.room_id = m.room_id
      WHERE m.id = chat_message_reactions.message_id
        AND crm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON public.chat_message_reactions FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
  ON public.chat_message_reactions (message_id);

ALTER TABLE public.chat_message_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
