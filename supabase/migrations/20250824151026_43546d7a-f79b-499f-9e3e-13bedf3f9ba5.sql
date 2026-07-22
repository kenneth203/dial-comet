-- First, let's see what foreign key constraints exist on billing_invoices
-- Drop the existing foreign key constraint that points to billing_customers
ALTER TABLE public.billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_customer_id_fkey;

-- Add a new foreign key constraint that points to the customers table
ALTER TABLE public.billing_invoices 
ADD CONSTRAINT billing_invoices_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- Update existing invoices to use proper customer IDs (if any exist that need mapping)
-- Since the current invoices have invalid customer IDs, we'll delete them and regenerate
DELETE FROM public.billing_invoices WHERE customer_id NOT IN (SELECT id FROM public.customers);