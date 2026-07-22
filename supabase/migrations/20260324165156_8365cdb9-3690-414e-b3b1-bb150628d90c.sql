-- Null out plaintext PII columns where encrypted counterparts exist
UPDATE system_users
SET
  national_insurance = NULL,
  account_number = NULL,
  sort_code = NULL
WHERE
  national_insurance IS NOT NULL
  OR account_number IS NOT NULL
  OR sort_code IS NOT NULL;

-- Add a trigger to prevent future plaintext PII writes to these columns
CREATE OR REPLACE FUNCTION prevent_plaintext_pii()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Force these columns to NULL on any insert or update
  NEW.national_insurance := NULL;
  NEW.account_number := NULL;
  NEW.sort_code := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_no_plaintext_pii ON system_users;

CREATE TRIGGER enforce_no_plaintext_pii
  BEFORE INSERT OR UPDATE ON system_users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_plaintext_pii();