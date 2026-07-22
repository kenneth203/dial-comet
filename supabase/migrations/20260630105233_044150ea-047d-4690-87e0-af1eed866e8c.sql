
-- Chat attachments table
CREATE TABLE public.chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_attachments TO authenticated;
GRANT ALL ON public.chat_attachments TO service_role;

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_att_select_member" ON public.chat_attachments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM chat_room_members crm
  WHERE crm.room_id = chat_attachments.room_id AND crm.user_id = auth.uid()
));

CREATE POLICY "chat_att_insert_member" ON public.chat_attachments
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid() AND EXISTS (
    SELECT 1 FROM chat_room_members crm
    WHERE crm.room_id = chat_attachments.room_id AND crm.user_id = auth.uid()
  )
);

CREATE POLICY "chat_att_delete_owner" ON public.chat_attachments
FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());

CREATE INDEX idx_chat_attachments_message ON public.chat_attachments(message_id);
CREATE INDEX idx_chat_attachments_expires ON public.chat_attachments(expires_at);

-- Allow chat_messages content to be empty when an attachment exists
ALTER TABLE public.chat_messages ALTER COLUMN content DROP NOT NULL;

-- Storage RLS for chat-attachments bucket. Path layout: <room_id>/<message_id>/<filename>
CREATE POLICY "chat_att_storage_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments' AND EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.user_id = auth.uid()
      AND crm.room_id::text = split_part(name, '/', 1)
  )
);

CREATE POLICY "chat_att_storage_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments' AND owner = auth.uid() AND EXISTS (
    SELECT 1 FROM public.chat_room_members crm
    WHERE crm.user_id = auth.uid()
      AND crm.room_id::text = split_part(name, '/', 1)
  )
);

CREATE POLICY "chat_att_storage_delete_owner" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments' AND owner = auth.uid());

-- Cleanup function: delete attachments older than 30 days (DB rows + storage objects)
CREATE OR REPLACE FUNCTION public.cleanup_expired_chat_attachments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  -- Remove storage objects for expired attachments
  DELETE FROM storage.objects
  WHERE bucket_id = 'chat-attachments'
    AND name IN (SELECT file_path FROM public.chat_attachments WHERE expires_at <= now());

  WITH del AS (
    DELETE FROM public.chat_attachments WHERE expires_at <= now() RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_chat_attachments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_chat_attachments() TO service_role;

-- Schedule daily cleanup at 03:15 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup_expired_chat_attachments');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup_expired_chat_attachments',
      '15 3 * * *',
      $cron$SELECT public.cleanup_expired_chat_attachments();$cron$
    );
  END IF;
END $$;
