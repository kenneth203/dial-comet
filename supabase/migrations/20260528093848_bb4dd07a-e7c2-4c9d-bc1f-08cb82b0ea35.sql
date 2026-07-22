ALTER TABLE public.proposal_tokens
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selected_package JSONB,
  ADD COLUMN IF NOT EXISTS proposal_record JSONB;

ALTER TABLE public.proposal_tokens
  ALTER COLUMN packages_snapshot SET DEFAULT '[]'::jsonb,
  ALTER COLUMN customer_snapshot SET DEFAULT '{}'::jsonb,
  ALTER COLUMN status SET DEFAULT 'pending';