-- Fix the orphaned holiday request for Kate Campbell
-- The request d4ef9473 has both system_user_id and user_id as NULL
UPDATE holiday_requests 
SET system_user_id = 'c4cfb065-881d-4c4c-9129-b6f3659599ac'
WHERE id = 'd4ef9473-7ee7-4969-b267-b845f02f5425'
  AND system_user_id IS NULL 
  AND user_id IS NULL;

-- Create a trigger to prevent future orphaned holiday requests
-- If both system_user_id and user_id are NULL, reject the insert
CREATE OR REPLACE FUNCTION validate_holiday_request_user_link()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.system_user_id IS NULL AND NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Holiday request must have either system_user_id or user_id set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_holiday_request_user_link ON holiday_requests;
CREATE TRIGGER trg_validate_holiday_request_user_link
  BEFORE INSERT OR UPDATE ON holiday_requests
  FOR EACH ROW
  EXECUTE FUNCTION validate_holiday_request_user_link();