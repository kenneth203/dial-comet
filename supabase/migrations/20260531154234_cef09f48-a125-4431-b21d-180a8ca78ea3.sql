CREATE POLICY chat_reads_select_room_member
ON public.chat_message_reads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_messages m
    JOIN public.chat_room_members crm ON crm.room_id = m.room_id
    WHERE m.id = chat_message_reads.message_id
      AND crm.user_id = auth.uid()
  )
);