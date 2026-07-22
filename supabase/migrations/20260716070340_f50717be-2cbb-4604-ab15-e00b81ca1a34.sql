
ALTER TABLE public.email_intake_settings
  ADD COLUMN IF NOT EXISTS gmail_query text NOT NULL DEFAULT 'to:dictations@thevateam.london is:unread newer_than:7d',
  ADD COLUMN IF NOT EXISTS gmail_poll_enabled boolean NOT NULL DEFAULT true;
