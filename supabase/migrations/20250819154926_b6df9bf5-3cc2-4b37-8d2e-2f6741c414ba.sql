-- Add new billing fields to customers table
ALTER TABLE public.customers 
ADD COLUMN services jsonb DEFAULT '[]'::jsonb,
ADD COLUMN virtual_assistant_plan text,
ADD COLUMN call_answering_plan text;