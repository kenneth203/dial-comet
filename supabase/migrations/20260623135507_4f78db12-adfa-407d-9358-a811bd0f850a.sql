ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cb_package text,
  ADD COLUMN IF NOT EXISTS cb_price numeric,
  ADD COLUMN IF NOT EXISTS cb_included_minutes integer,
  ADD COLUMN IF NOT EXISTS cb_overage_rate numeric;