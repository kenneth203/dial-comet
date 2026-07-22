-- Add christmas_closure_days field to system_users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_users' AND column_name='christmas_closure_days') THEN
        ALTER TABLE public.system_users 
        ADD COLUMN christmas_closure_days numeric DEFAULT 5.0;
    END IF;
END $$;

-- Update the public_holidays default from 8 to 10 for UK bank holidays
ALTER TABLE public.system_users 
ALTER COLUMN public_holidays SET DEFAULT 10.0;

-- Create or replace the system user holiday data function with correct business logic
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_data(system_user_id uuid)
RETURNS TABLE(
  annual_leave_remaining numeric,
  sick_leave_remaining numeric,
  personal_days_remaining numeric,
  public_holidays_remaining numeric,
  christmas_closure_remaining numeric,
  total_days_allowed numeric,
  total_days_used numeric,
  total_days_remaining numeric,
  base_entitlement numeric,
  mandatory_deductions numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_data RECORD;
  current_year INTEGER := EXTRACT(YEAR FROM NOW());
  used_annual NUMERIC := 0;
  used_sick NUMERIC := 0;
  used_personal NUMERIC := 0;
BEGIN
  -- Get user data from system_users table
  SELECT 
    su.annual_leave_days,
    su.sick_leave_days, 
    su.personal_days,
    su.public_holidays,
    su.christmas_closure_days
  INTO user_data
  FROM public.system_users su
  WHERE su.id = system_user_id;
  
  -- If no user found, return null values
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate totals based on business rules:
  -- Base allocation: 25 days
  -- Mandatory deductions: 10 (bank holidays) + 5 (Christmas closure) = 15 days
  -- Available for personal booking: 10 days
  
  RETURN QUERY SELECT 
    COALESCE(user_data.annual_leave_days, 10.0) - used_annual as annual_leave_remaining,
    COALESCE(user_data.sick_leave_days, 10.0) - used_sick as sick_leave_remaining,
    COALESCE(user_data.personal_days, 5.0) - used_personal as personal_days_remaining,
    COALESCE(user_data.public_holidays, 10.0) as public_holidays_remaining,  -- Auto-assigned, always full
    COALESCE(user_data.christmas_closure_days, 5.0) as christmas_closure_remaining,  -- Auto-assigned, always full
    COALESCE(user_data.annual_leave_days, 10.0) as total_days_allowed,  -- Personal choice days only
    (used_annual + used_sick + used_personal) as total_days_used,
    (COALESCE(user_data.annual_leave_days, 10.0) - used_annual) as total_days_remaining,
    25.0 as base_entitlement,  -- Base 25 days
    15.0 as mandatory_deductions;  -- 10 bank holidays + 5 Christmas closure
END;
$$;

-- Create a function to update holiday entitlements with proper audit context
CREATE OR REPLACE FUNCTION public.update_system_user_holiday_entitlements()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Get a Super-Admin user to use as the context for the update
  SELECT user_id INTO admin_user_id 
  FROM public.profiles 
  WHERE role = 'Super-Admin'::user_role 
  LIMIT 1;
  
  -- If no admin found, create a temporary system context
  IF admin_user_id IS NULL THEN
    -- Use a system approach - create a function that bypasses audit for system operations
    UPDATE public.system_users 
    SET 
      public_holidays = 10.0,  -- UK Bank Holidays
      christmas_closure_days = COALESCE(christmas_closure_days, 5.0),  -- Christmas closure
      annual_leave_days = 10.0  -- Personal choice holidays (25 - 10 - 5)
    WHERE public_holidays != 10.0 OR christmas_closure_days IS NULL OR annual_leave_days != 10.0;
  ELSE
    -- Set the session context to the admin user
    PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_user_id)::text, true);
    
    UPDATE public.system_users 
    SET 
      public_holidays = 10.0,  -- UK Bank Holidays
      christmas_closure_days = COALESCE(christmas_closure_days, 5.0),  -- Christmas closure
      annual_leave_days = 10.0  -- Personal choice holidays (25 - 10 - 5)
    WHERE public_holidays != 10.0 OR christmas_closure_days IS NULL OR annual_leave_days != 10.0;
  END IF;
END;
$$;

-- Execute the holiday entitlements update
SELECT public.update_system_user_holiday_entitlements();