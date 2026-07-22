
-- Create proposal_tokens table
CREATE TABLE public.proposal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  service_type text NOT NULL CHECK (service_type IN ('VA', 'VR', 'AI', 'DT')),
  packages_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  completed_at timestamptz,
  selected_package jsonb,
  proposal_record jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index on token for fast lookups
CREATE INDEX idx_proposal_tokens_token ON public.proposal_tokens (token);
CREATE INDEX idx_proposal_tokens_customer_id ON public.proposal_tokens (customer_id);

-- Enable RLS - block all direct access, only edge functions (service role) access this
ALTER TABLE public.proposal_tokens ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to select their own created proposals
CREATE POLICY "Staff can view own proposals"
  ON public.proposal_tokens
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Allow authenticated users to insert
CREATE POLICY "Staff can create proposals"
  ON public.proposal_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());
