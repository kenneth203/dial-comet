CREATE OR REPLACE FUNCTION public.prevent_duplicate_customers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm_name TEXT;
  norm_email TEXT;
  match_id UUID;
  match_name TEXT;
BEGIN
  norm_name := lower(regexp_replace(coalesce(NEW.name, ''), '\s+', ' ', 'g'));
  norm_name := trim(norm_name);
  norm_email := lower(trim(coalesce(NEW.email, '')));

  IF norm_name = '' THEN
    RETURN NEW;
  END IF;

  SELECT id, name INTO match_id, match_name
  FROM public.customers
  WHERE id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      lower(trim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'))) = norm_name
      OR (norm_email <> '' AND lower(trim(coalesce(email, ''))) = norm_email)
    )
  LIMIT 1;

  IF match_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_CUSTOMER: A customer named "%" already exists. Please edit the existing record instead of creating a duplicate.', match_name
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_customers ON public.customers;
CREATE TRIGGER trg_prevent_duplicate_customers
BEFORE INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_customers();