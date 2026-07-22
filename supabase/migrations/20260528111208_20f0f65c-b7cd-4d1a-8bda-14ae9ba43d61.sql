
ALTER TABLE public.proposal_invoices
  ADD COLUMN IF NOT EXISTS reminders_sent_at JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_proposal_invoices_due_at ON public.proposal_invoices(due_at);
