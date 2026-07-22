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
DECLARE
  v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT user_id INTO v_owner FROM public.customers WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.is_admin_or_higher() AND v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this customer';
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