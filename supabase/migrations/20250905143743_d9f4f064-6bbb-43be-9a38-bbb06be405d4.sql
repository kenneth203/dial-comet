-- Fix security issues from the previous migration
-- Update the function to have proper search_path setting
DROP FUNCTION IF EXISTS public.update_document_shares_updated_at();

CREATE OR REPLACE FUNCTION public.update_document_shares_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;