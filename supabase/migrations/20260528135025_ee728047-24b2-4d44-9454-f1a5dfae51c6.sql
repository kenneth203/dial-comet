
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill responses from legacy `data` column if present
UPDATE public.form_submissions
SET responses = COALESCE(data, '{}'::jsonb)
WHERE responses = '{}'::jsonb AND data IS NOT NULL AND data <> '{}'::jsonb;

UPDATE public.form_submissions
SET completed_at = submitted_at
WHERE completed_at IS NULL AND submitted_at IS NOT NULL;

UPDATE public.form_submissions
SET status = 'completed'
WHERE submitted_at IS NOT NULL AND status = 'pending';
