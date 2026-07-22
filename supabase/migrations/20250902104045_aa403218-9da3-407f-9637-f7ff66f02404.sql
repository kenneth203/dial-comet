-- Remove the conflicting overload so Postgres stops seeing two candidates
DROP FUNCTION IF EXISTS public.create_holiday_request_secure(date, date, absence_type, text);