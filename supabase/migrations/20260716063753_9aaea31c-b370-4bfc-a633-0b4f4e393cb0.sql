
CREATE TABLE public.inbound_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  from_email text NOT NULL,
  from_name text,
  subject text,
  message_id text UNIQUE,
  attachment_count integer NOT NULL DEFAULT 0,
  attachment_names text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'received',
  task_id uuid,
  assigned_to uuid,
  customer_id uuid,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_log_status_chk
    CHECK (status IN ('received','processed','failed','retrying','skipped'))
);

CREATE INDEX inbound_email_log_received_at_idx ON public.inbound_email_log (received_at DESC);
CREATE INDEX inbound_email_log_status_idx ON public.inbound_email_log (status);
CREATE INDEX inbound_email_log_retry_idx
  ON public.inbound_email_log (status, attempt_count, last_attempt_at)
  WHERE status = 'failed';

GRANT SELECT ON public.inbound_email_log TO authenticated;
GRANT ALL ON public.inbound_email_log TO service_role;

ALTER TABLE public.inbound_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view inbound email log"
ON public.inbound_email_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.system_users su
    WHERE su.id = auth.uid()
      AND su.role IN ('Super-Admin','Admin')
  )
);

CREATE TRIGGER inbound_email_log_updated_at
BEFORE UPDATE ON public.inbound_email_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.inbound_email_log;
