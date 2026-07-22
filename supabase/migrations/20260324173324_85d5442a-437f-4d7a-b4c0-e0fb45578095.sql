CREATE OR REPLACE FUNCTION public.update_customer_script(
  p_id uuid,
  p_script text DEFAULT NULL,
  p_script_tags jsonb DEFAULT NULL
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
    script = COALESCE(p_script, script),
    script_tags = COALESCE(p_script_tags, script_tags),
    updated_at = now()
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;