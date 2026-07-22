-- Create customers table for proper data persistence
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  business_type TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postcode TEXT,
  tel TEXT,
  mobile TEXT,
  email TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  contact TEXT,
  phone TEXT,
  packages JSONB DEFAULT '[]'::jsonb,
  calls_per_month TEXT,
  billing_day DATE,
  billing_options TEXT DEFAULT 'VAT',
  billing_status JSONB DEFAULT '[]'::jsonb,
  additional_services JSONB DEFAULT '[]'::jsonb,
  call_handling_tier TEXT,
  contacts JSONB DEFAULT '[]'::jsonb,
  address TEXT,
  outcome_how TEXT,
  outcome_when TEXT,
  outcome_format TEXT,
  message_selection TEXT,
  filters TEXT,
  system_link TEXT,
  script TEXT,
  script_tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own customers" 
ON public.customers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customers" 
ON public.customers 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own customers" 
ON public.customers 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();