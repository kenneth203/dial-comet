-- Create a lightweight RPC for updating lead metadata (accessible to all authenticated users)
CREATE OR REPLACE FUNCTION public.update_customer_lead_metadata(
  p_id uuid,
  p_status text DEFAULT NULL,
  p_lead_metadata jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.customers
  SET 
    status = COALESCE(p_status, status),
    lead_metadata = COALESCE(p_lead_metadata, lead_metadata),
    updated_at = now()
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;