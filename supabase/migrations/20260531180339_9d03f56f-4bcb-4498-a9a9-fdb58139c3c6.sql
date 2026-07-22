
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS agent text,
  ADD COLUMN IF NOT EXISTS ddi text,
  ADD COLUMN IF NOT EXISTS time text,
  ADD COLUMN IF NOT EXISTS duration text,
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS channel_type text,
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS raw_source_row jsonb;
