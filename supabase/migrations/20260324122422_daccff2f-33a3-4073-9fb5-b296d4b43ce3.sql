-- Drop all old overloads
DROP FUNCTION IF EXISTS public.create_holiday_request_secure(text, text, absence_type, text);
DROP FUNCTION IF EXISTS public.create_holiday_request_secure(uuid, absence_type, date, date, text);
DROP FUNCTION IF EXISTS public.create_holiday_request_secure(absence_type, date, date, text, uuid);

-- The correct one (p_absence_type text, p_start_date date, p_end_date date, p_reason text, p_target_user_id uuid) remains.