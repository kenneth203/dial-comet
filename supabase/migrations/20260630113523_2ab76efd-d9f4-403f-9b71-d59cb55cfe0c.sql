ALTER TABLE public.chat_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.chat_message_deliveries REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_attachments';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_deliveries';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;