-- First, clear out all existing invoices since they have invalid customer IDs
DELETE FROM public.billing_invoices;

-- Drop the existing foreign key constraint that points to billing_customers
ALTER TABLE public.billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_customer_id_fkey;

-- Add a new foreign key constraint that points to the customers table
ALTER TABLE public.billing_invoices 
ADD CONSTRAINT billing_invoices_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;