-- Drop the old conflicting function
DROP FUNCTION IF EXISTS get_system_user_holiday_data(uuid, integer);

-- The correct function should now be the only one remaining