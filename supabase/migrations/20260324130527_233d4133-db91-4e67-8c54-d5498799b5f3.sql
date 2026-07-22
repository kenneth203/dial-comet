CREATE OR REPLACE FUNCTION validate_holiday_request_user_link()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.system_user_id IS NULL AND NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Holiday request must have either system_user_id or user_id set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;