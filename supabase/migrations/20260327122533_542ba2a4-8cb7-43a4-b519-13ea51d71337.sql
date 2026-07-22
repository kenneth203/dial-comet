-- Add Clinic package fields to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cl_package text,
  ADD COLUMN IF NOT EXISTS cl_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cl_included_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cl_overage_rate numeric DEFAULT 0;