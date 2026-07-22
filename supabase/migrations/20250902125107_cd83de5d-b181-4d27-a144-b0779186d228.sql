-- Backfill existing holiday_requests to ensure consistent ownership
-- This fixes the issue where user_id and system_user_id don't match

-- Fix records where system_user_id exists but user_id doesn't match
UPDATE public.holiday_requests hr
SET user_id = su.user_id
FROM public.system_users su
WHERE hr.system_user_id = su.id
  AND hr.user_id != su.user_id;

-- Fix records where user_id exists but system_user_id is missing
UPDATE public.holiday_requests hr
SET system_user_id = su.id
FROM public.system_users su
WHERE hr.user_id = su.user_id
  AND hr.system_user_id IS NULL;