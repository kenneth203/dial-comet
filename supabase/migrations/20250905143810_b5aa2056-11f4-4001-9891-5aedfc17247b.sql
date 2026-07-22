-- Fix security issues by properly recreating the function
-- Drop trigger first, then function, then recreate both
DROP TRIGGER IF EXISTS update_document_shares_updated_at ON public.document_shares;
DROP FUNCTION IF EXISTS public.update_document_shares_updated_at() CASCADE;

-- Recreate function with proper security settings
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

-- Recreate trigger
CREATE TRIGGER update_document_shares_updated_at
  BEFORE UPDATE ON public.document_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.update_document_shares_updated_at();