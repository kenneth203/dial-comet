
CREATE OR REPLACE FUNCTION public.normalise_customer_postcode()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  raw text;
  compact text;
  outward text;
  inward text;
BEGIN
  raw := btrim(coalesce(NEW.postcode, ''));

  IF raw = '' THEN
    NEW.postcode := NULL;
    RETURN NEW;
  END IF;

  -- Strip all whitespace and uppercase
  compact := upper(regexp_replace(raw, '\s+', '', 'g'));

  -- UK postcodes are 5-7 alphanumerics; final 3 chars are inward code (digit + 2 letters)
  IF compact !~ '^[A-Z0-9]{5,7}$' THEN
    RAISE EXCEPTION 'Invalid UK postcode: %', raw
      USING HINT = 'Expected 5-7 letters/digits, e.g. SW1A 1AA, RG40 5PN, M1 1AA.';
  END IF;

  outward := substr(compact, 1, length(compact) - 3);
  inward  := substr(compact, length(compact) - 2, 3);

  IF inward !~ '^[0-9][A-Z]{2}$' THEN
    RAISE EXCEPTION 'Invalid UK postcode inward code: %', raw
      USING HINT = 'The last 3 characters must be a digit followed by two letters (e.g. 1AA).';
  END IF;

  IF outward !~ '^[A-Z]{1,2}[0-9][A-Z0-9]?$' THEN
    RAISE EXCEPTION 'Invalid UK postcode outward code: %', raw
      USING HINT = 'The first part must be 1-2 letters followed by a digit (e.g. SW1A, RG40, M1).';
  END IF;

  NEW.postcode := outward || ' ' || inward;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalise_customer_postcode ON public.customers;

CREATE TRIGGER trg_normalise_customer_postcode
BEFORE INSERT OR UPDATE OF postcode ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.normalise_customer_postcode();
