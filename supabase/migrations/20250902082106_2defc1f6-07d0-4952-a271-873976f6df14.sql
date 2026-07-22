-- Fix data integrity for holiday_requests to prevent holiday bleeding between users

-- 1) Backfill system_user_id for legacy rows by joining on user_id
UPDATE public.holiday_requests hr
SET system_user_id = su.id
FROM public.system_users su
WHERE hr.system_user_id IS NULL
  AND hr.user_id = su.user_id;

-- 2) Align user_id to the system_user_id's owning user if they disagree
UPDATE public.holiday_requests hr
SET user_id = su.user_id
FROM public.system_users su
WHERE hr.system_user_id = su.id
  AND (hr.user_id IS DISTINCT FROM su.user_id);

-- 3) Ensure ongoing consistency with a trigger (idempotent recreate)
DROP TRIGGER IF EXISTS trg_enforce_hr_user_consistency ON public.holiday_requests;

CREATE TRIGGER trg_enforce_hr_user_consistency
BEFORE INSERT OR UPDATE ON public.holiday_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_holiday_request_user_consistency();