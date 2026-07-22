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

  -- If unchanged from existing stored value on UPDATE, leave as-is
  IF TG_OP = 'UPDATE' AND OLD.postcode IS NOT DISTINCT FROM NEW.postcode THEN
    RETURN NEW;
  END IF;

  compact := upper(regexp_replace(raw, '\s+', '', 'g'));

  IF compact !~ '^[A-Z0-9]{5,7}$' THEN
    -- Not a valid UK shape: keep the raw value rather than block the save
    NEW.postcode := raw;
    RETURN NEW;
  END IF;

  outward := substr(compact, 1, length(compact) - 3);
  inward  := substr(compact, length(compact) - 2, 3);

  IF inward !~ '^[0-9][A-Z]{2}$' OR outward !~ '^[A-Z]{1,2}[0-9][A-Z0-9]?$' THEN
    NEW.postcode := raw;
    RETURN NEW;
  END IF;

  NEW.postcode := outward || ' ' || inward;
  RETURN NEW;
END;
$$;