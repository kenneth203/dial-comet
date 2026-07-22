-- Create billing system tables

-- Billing Customers table (separate from existing customers)
CREATE TABLE public.billing_customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  telephone TEXT,
  package_name TEXT,
  base_call_allowance INTEGER DEFAULT 0,
  monthly_charge DECIMAL(10,2) DEFAULT 0,
  rate_per_call DECIMAL(10,4) DEFAULT 0,
  rate_per_minute DECIMAL(10,4) DEFAULT 0,
  rate_sms DECIMAL(10,4) DEFAULT 0,
  rate_transfer_landline DECIMAL(10,4) DEFAULT 0,
  rate_transfer_mobile DECIMAL(10,4) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Call Logs table
CREATE TABLE public.call_logs (
  call_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.billing_customers(customer_id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  duration INTERVAL,
  call_type TEXT CHECK (call_type IN ('Inbound', 'Outbound')),
  channel_type TEXT CHECK (channel_type IN ('Voice', 'SMS', 'Other')),
  agent TEXT,
  ddi TEXT,
  result TEXT,
  billing_period TEXT NOT NULL, -- Format: 'YYYY-MM'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Invoices table
CREATE TABLE public.billing_invoices (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.billing_customers(customer_id),
  billing_period TEXT NOT NULL,
  base_calls_allowed INTEGER DEFAULT 0,
  calls_made INTEGER DEFAULT 0,
  extra_calls INTEGER DEFAULT 0,
  total_minutes DECIMAL(10,2) DEFAULT 0,
  extra_minutes DECIMAL(10,2) DEFAULT 0,
  extra_charges DECIMAL(10,2) DEFAULT 0,
  base_charge DECIMAL(10,2) DEFAULT 0,
  total_invoice DECIMAL(10,2) DEFAULT 0,
  vat_rate DECIMAL(5,4) DEFAULT 0.20,
  total_with_vat DECIMAL(10,2) DEFAULT 0,
  created_on TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Billing Settings table
CREATE TABLE public.billing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vat_rate DECIMAL(5,4) DEFAULT 0.20,
  default_package TEXT DEFAULT 'Standard',
  default_call_rate DECIMAL(10,4) DEFAULT 0.05,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all billing tables
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - only Kenneth Pote can access
CREATE POLICY "Only Kenneth Pote can access billing_customers" 
ON public.billing_customers 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND name = 'Kenneth Pote'
  )
);

CREATE POLICY "Only Kenneth Pote can access call_logs" 
ON public.call_logs 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND name = 'Kenneth Pote'
  )
);

CREATE POLICY "Only Kenneth Pote can access billing_invoices" 
ON public.billing_invoices 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND name = 'Kenneth Pote'
  )
);

CREATE POLICY "Only Kenneth Pote can access billing_settings" 
ON public.billing_settings 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND name = 'Kenneth Pote'
  )
);

-- Insert default billing settings
INSERT INTO public.billing_settings (vat_rate, default_package, default_call_rate)
VALUES (0.20, 'Standard Package', 0.05);

-- Create indexes for better performance
CREATE INDEX idx_call_logs_customer_id ON public.call_logs(customer_id);
CREATE INDEX idx_call_logs_billing_period ON public.call_logs(billing_period);
CREATE INDEX idx_call_logs_date ON public.call_logs(date);
CREATE INDEX idx_billing_invoices_customer_id ON public.billing_invoices(customer_id);
CREATE INDEX idx_billing_invoices_billing_period ON public.billing_invoices(billing_period);