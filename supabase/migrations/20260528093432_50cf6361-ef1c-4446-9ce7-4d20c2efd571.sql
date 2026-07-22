ALTER TABLE public.proposal_tokens
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';