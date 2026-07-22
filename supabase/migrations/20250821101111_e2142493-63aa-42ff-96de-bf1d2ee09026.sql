-- Add system_icon column to customers table for storing booking system icons
ALTER TABLE public.customers 
ADD COLUMN system_icon TEXT;