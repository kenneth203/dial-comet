-- Enhance billing system tables to support the specification

-- Add customer pricing table for per-call and overage rates
CREATE TABLE public.customer_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.billing_customers(customer_id),
  effective_from DATE NOT NULL,
  per_call_rate_pence INTEGER NOT NULL, -- Store in pence to avoid decimal issues
  overage_per_minute_pence INTEGER NOT NULL,
  std_included_seconds INTEGER NOT NULL DEFAULT 180, -- 3 minutes standard
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(customer_id, effective_from)
);

-- Add billing periods table
CREATE TABLE public.billing_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.billing_customers(customer_id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'invoiced', 'void')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(customer_id, period_start, period_end)
);

-- Add billing line items table for detailed call billing
CREATE TABLE public.billing_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_period_id UUID NOT NULL REFERENCES public.billing_periods(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES public.call_logs(call_id),
  per_call_rate_pence INTEGER NOT NULL,
  overage_per_minute_pence INTEGER NOT NULL,
  std_included_seconds INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  overage_minutes INTEGER NOT NULL DEFAULT 0,
  charge_per_call_pence INTEGER NOT NULL,
  charge_overage_pence INTEGER NOT NULL DEFAULT 0,
  charge_total_pence INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(call_id) -- Prevent double billing
);

-- Add import batches table to track imports
CREATE TABLE public.import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  row_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enhance call_logs table structure
ALTER TABLE public.call_logs 
ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('Inbound', 'Outbound')),
ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.import_batches(id),
ADD COLUMN IF NOT EXISTS raw_source_row JSONB;

-- Update existing call_logs to populate new fields where possible
UPDATE public.call_logs 
SET 
  call_started_at = (date + time::time)::timestamp with time zone,
  duration_seconds = EXTRACT(EPOCH FROM duration)::integer
WHERE call_started_at IS NULL AND date IS NOT NULL AND time IS NOT NULL;

-- Enable RLS on new tables
ALTER TABLE public.customer_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for customer_pricing
CREATE POLICY "Super-Admin can access customer_pricing" 
ON public.customer_pricing 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND role = 'Super-Admin'::user_role
));

-- Create RLS policies for billing_periods
CREATE POLICY "Super-Admin can access billing_periods" 
ON public.billing_periods 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND role = 'Super-Admin'::user_role
));

-- Create RLS policies for billing_line_items
CREATE POLICY "Super-Admin can access billing_line_items" 
ON public.billing_line_items 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND role = 'Super-Admin'::user_role
));

-- Create RLS policies for import_batches
CREATE POLICY "Super-Admin can access import_batches" 
ON public.import_batches 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() 
  AND role = 'Super-Admin'::user_role
));

-- Create indexes for performance
CREATE INDEX idx_customer_pricing_lookup ON public.customer_pricing(customer_id, effective_from DESC);
CREATE INDEX idx_billing_periods_customer ON public.billing_periods(customer_id, period_start, period_end);
CREATE INDEX idx_billing_line_items_period ON public.billing_line_items(billing_period_id);
CREATE INDEX idx_call_logs_customer_date ON public.call_logs(customer_id, call_started_at);

-- Create function to calculate billing for a period
CREATE OR REPLACE FUNCTION public.calculate_billing_for_period(
  p_customer_id UUID,
  p_period_start DATE,
  p_period_end DATE
) RETURNS TABLE(
  total_calls BIGINT,
  total_overage_minutes BIGINT,
  per_call_total_pence BIGINT,
  overage_total_pence BIGINT,
  grand_total_pence BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only Super-Admin can calculate billing
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'::user_role
  ) THEN
    RAISE EXCEPTION 'Access denied: Only Super-Admin can calculate billing';
  END IF;

  RETURN QUERY
  SELECT 
    COUNT(bli.id)::BIGINT as total_calls,
    COALESCE(SUM(bli.overage_minutes), 0)::BIGINT as total_overage_minutes,
    COALESCE(SUM(bli.charge_per_call_pence), 0)::BIGINT as per_call_total_pence,
    COALESCE(SUM(bli.charge_overage_pence), 0)::BIGINT as overage_total_pence,
    COALESCE(SUM(bli.charge_total_pence), 0)::BIGINT as grand_total_pence
  FROM public.billing_periods bp
  JOIN public.billing_line_items bli ON bli.billing_period_id = bp.id
  WHERE bp.customer_id = p_customer_id
    AND bp.period_start = p_period_start
    AND bp.period_end = p_period_end;
END;
$$;

-- Create function to generate billing for a period
CREATE OR REPLACE FUNCTION public.generate_billing_for_period(
  p_period_start DATE,
  p_period_end DATE
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  customer_rec RECORD;
  call_rec RECORD;
  pricing_rec RECORD;
  billing_period_id UUID;
  over_seconds INTEGER;
  over_minutes INTEGER;
  charge_per_call INTEGER;
  charge_overage INTEGER;
  processed_count INTEGER := 0;
BEGIN
  -- Only Super-Admin can generate billing
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'::user_role
  ) THEN
    RAISE EXCEPTION 'Access denied: Only Super-Admin can generate billing';
  END IF;

  -- Loop through all active customers
  FOR customer_rec IN 
    SELECT customer_id FROM public.billing_customers WHERE active = true
  LOOP
    -- Create or get billing period
    INSERT INTO public.billing_periods (customer_id, period_start, period_end)
    VALUES (customer_rec.customer_id, p_period_start, p_period_end)
    ON CONFLICT (customer_id, period_start, period_end) DO NOTHING;
    
    SELECT id INTO billing_period_id
    FROM public.billing_periods
    WHERE customer_id = customer_rec.customer_id
      AND period_start = p_period_start
      AND period_end = p_period_end;

    -- Process calls for this customer in the period
    FOR call_rec IN
      SELECT cl.* 
      FROM public.call_logs cl
      WHERE cl.customer_id = customer_rec.customer_id
        AND cl.call_started_at >= p_period_start::timestamp with time zone
        AND cl.call_started_at < (p_period_end + interval '1 day')::timestamp with time zone
        AND cl.duration_seconds IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.billing_line_items 
          WHERE call_id = cl.call_id
        )
    LOOP
      -- Get pricing for this call date
      SELECT * INTO pricing_rec
      FROM public.customer_pricing cp
      WHERE cp.customer_id = customer_rec.customer_id
        AND cp.effective_from <= call_rec.call_started_at::date
      ORDER BY cp.effective_from DESC
      LIMIT 1;

      -- Skip if no pricing found
      CONTINUE WHEN pricing_rec IS NULL;

      -- Calculate overage
      over_seconds := GREATEST(call_rec.duration_seconds - pricing_rec.std_included_seconds, 0);
      over_minutes := CEILING(over_seconds::numeric / 60.0)::integer;

      -- Calculate charges
      charge_per_call := pricing_rec.per_call_rate_pence;
      charge_overage := over_minutes * pricing_rec.overage_per_minute_pence;

      -- Insert billing line item
      INSERT INTO public.billing_line_items (
        billing_period_id,
        call_id,
        per_call_rate_pence,
        overage_per_minute_pence,
        std_included_seconds,
        duration_seconds,
        overage_minutes,
        charge_per_call_pence,
        charge_overage_pence,
        charge_total_pence
      ) VALUES (
        billing_period_id,
        call_rec.call_id,
        pricing_rec.per_call_rate_pence,
        pricing_rec.overage_per_minute_pence,
        pricing_rec.std_included_seconds,
        call_rec.duration_seconds,
        over_minutes,
        charge_per_call,
        charge_overage,
        charge_per_call + charge_overage
      );

      processed_count := processed_count + 1;
    END LOOP;
  END LOOP;

  RETURN processed_count;
END;
$$;