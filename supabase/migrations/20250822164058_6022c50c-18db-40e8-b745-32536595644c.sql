-- Update RLS policies to use role-based access instead of name-based

-- Drop existing policies
DROP POLICY IF EXISTS "Only Kenneth Pote can access billing_customers" ON public.billing_customers;
DROP POLICY IF EXISTS "Only Kenneth Pote can access call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Only Kenneth Pote can access billing_invoices" ON public.billing_invoices;
DROP POLICY IF EXISTS "Only Kenneth Pote can access billing_settings" ON public.billing_settings;

-- Create new role-based policies for billing_customers
CREATE POLICY "Super-Admin can access billing_customers" 
ON public.billing_customers 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);

-- Create new role-based policies for call_logs
CREATE POLICY "Super-Admin can access call_logs" 
ON public.call_logs 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);

-- Create new role-based policies for billing_invoices
CREATE POLICY "Super-Admin can access billing_invoices" 
ON public.billing_invoices 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);

-- Create new role-based policies for billing_settings
CREATE POLICY "Super-Admin can access billing_settings" 
ON public.billing_settings 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);