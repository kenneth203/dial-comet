-- Update existing system users to have default holiday entitlements if they don't have them
UPDATE public.system_users 
SET 
  annual_leave_days = COALESCE(annual_leave_days, 25.0),
  sick_leave_days = COALESCE(sick_leave_days, 10.0),
  personal_days = COALESCE(personal_days, 5.0),
  public_holidays = COALESCE(public_holidays, 8.0),
  carried_over_days = COALESCE(carried_over_days, 0.0),
  holiday_year = COALESCE(holiday_year, EXTRACT(YEAR FROM NOW())::integer)
WHERE 
  annual_leave_days IS NULL OR
  sick_leave_days IS NULL OR
  personal_days IS NULL OR
  public_holidays IS NULL OR
  carried_over_days IS NULL OR
  holiday_year IS NULL;