-- Add package-specific fields to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS va_package text,
ADD COLUMN IF NOT EXISTS va_packaged_hours numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS va_hourly_overage_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vr_package text,
ADD COLUMN IF NOT EXISTS vr_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vr_included_minutes numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS vr_overage_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_package text,
ADD COLUMN IF NOT EXISTS ai_setup_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_monthly_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_calls_allocated numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS dt_package text,
ADD COLUMN IF NOT EXISTS dt_price_per_minute numeric DEFAULT 0;