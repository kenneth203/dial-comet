-- 1) Ensure holiday_entitlements participates in realtime
-- Make sure updates publish full row image (safe for realtime consumers)
ALTER TABLE public.holiday_entitlements REPLICA IDENTITY FULL;

-- Add holiday_entitlements to the realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'holiday_entitlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.holiday_entitlements;
  END IF;
END$$;

-- 2) Create a trigger function to mirror entitlement changes from system_users to holiday_entitlements
CREATE OR REPLACE FUNCTION public.sync_holiday_entitlements_from_system_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year integer := EXTRACT(year FROM now())::int;
BEGIN
  -- Update current year's entitlement row if it exists
  UPDATE public.holiday_entitlements
     SET annual_leave_days   = COALESCE(NEW.annual_leave_days, annual_leave_days),
         sick_leave_days     = COALESCE(NEW.sick_leave_days, sick_leave_days),
         personal_days       = COALESCE(NEW.personal_days, personal_days),
         carried_over_days   = COALESCE(NEW.carried_over_days, carried_over_days),
         updated_at          = now()
   WHERE user_id = NEW.user_id
     AND year    = current_year;

  -- If nothing was updated, insert a new current-year row
  IF NOT FOUND THEN
    INSERT INTO public.holiday_entitlements (
      user_id, year, annual_leave_days, sick_leave_days, personal_days, carried_over_days, created_at, updated_at
    )
    VALUES (
      NEW.user_id,
      current_year,
      COALESCE(NEW.annual_leave_days, 25),
      COALESCE(NEW.sick_leave_days, 10),
      COALESCE(NEW.personal_days, 5),
      COALESCE(NEW.carried_over_days, 0),
      now(),
      now()
    );
  END IF;

  -- Note: public_holidays and christmas_closure_days are not stored in holiday_entitlements.
  -- We still update updated_at when those change so that a realtime event is emitted and clients can refetch.

  RETURN NEW;
END
$$;

-- 3) Attach trigger to system_users
DROP TRIGGER IF EXISTS trg_sync_holiday_entitlements ON public.system_users;

-- Fire on insert and on updates of entitlement-related columns, including public_holidays/christmas_closure_days
CREATE TRIGGER trg_sync_holiday_entitlements
AFTER INSERT OR UPDATE OF
  annual_leave_days,
  sick_leave_days,
  personal_days,
  carried_over_days,
  public_holidays,
  christmas_closure_days
ON public.system_users
FOR EACH ROW
EXECUTE FUNCTION public.sync_holiday_entitlements_from_system_users();