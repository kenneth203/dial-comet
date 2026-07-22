CREATE OR REPLACE FUNCTION public.calculate_working_days(start_date date, end_date date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  working_days numeric := 0;
  check_date date;
BEGIN
  IF start_date IS NULL OR end_date IS NULL THEN
    RETURN 0;
  END IF;

  IF end_date < start_date THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;

  check_date := start_date;

  WHILE check_date <= end_date LOOP
    IF EXTRACT(DOW FROM check_date) NOT IN (0, 6) THEN
      working_days := working_days + 1;
    END IF;

    check_date := check_date + INTERVAL '1 day';
  END LOOP;

  RETURN working_days;
END;
$$;