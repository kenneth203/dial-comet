CREATE TABLE public.chat_message_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX idx_chat_msg_deliveries_message ON public.chat_message_deliveries(message_id);
CREATE INDEX idx_chat_msg_deliveries_user ON public.chat_message_deliveries(user_id);

GRANT SELECT, INSERT ON public.chat_message_deliveries TO authenticated;
GRANT ALL ON public.chat_message_deliveries TO service_role;

ALTER TABLE public.chat_message_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_deliveries_insert_own
ON public.chat_message_deliveries
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY chat_deliveries_select_room_member
ON public.chat_message_deliveries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_messages m
    JOIN public.chat_room_members crm ON crm.room_id = m.room_id
    WHERE m.id = chat_message_deliveries.message_id
      AND crm.user_id = auth.uid()
  )
);