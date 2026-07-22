-- Fix the data model to properly handle multiple system users per auth user
-- The issue is that system_users should not directly reference auth.users if we want
-- multiple system users (like employees) managed by one admin auth user

-- First, let's modify the holiday_requests table to use system_user_id instead of user_id
-- Add a new column for system_user_id
ALTER TABLE public.holiday_requests 
ADD COLUMN IF NOT EXISTS system_user_id uuid;

-- Update existing holiday requests to map to the correct system user
-- For now, map them to the first system user with that user_id
UPDATE public.holiday_requests hr
SET system_user_id = (
  SELECT su.id 
  FROM public.system_users su 
  WHERE su.user_id = hr.user_id 
  LIMIT 1
)
WHERE hr.system_user_id IS NULL;

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_holiday_requests_system_user_id 
ON public.holiday_requests(system_user_id);

-- Add foreign key constraint to system_users
ALTER TABLE public.holiday_requests 
ADD CONSTRAINT fk_holiday_requests_system_user_id 
FOREIGN KEY (system_user_id) REFERENCES public.system_users(id);

-- Now update the create_holiday_request_admin function to use system_user_id
CREATE OR REPLACE FUNCTION public.create_holiday_request_admin(target_system_user_id uuid, req_start_date date, req_end_date date, req_absence_type absence_type, req_reason text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_working_days numeric;
  new_request_id uuid;
  current_user_role text;
  target_user_auth_id uuid;
  target_user_name text;
BEGIN
  -- Check if current user is admin
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied: Only administrators can create holiday requests for other users';
  END IF;
  
  -- Get current user role for logging
  SELECT role::text INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Get the system user details and their auth user_id
  SELECT user_id, name INTO target_user_auth_id, target_user_name
  FROM public.system_users 
  WHERE id = target_system_user_id AND status = 'Active';
  
  -- Validate target system user exists and is active
  IF target_user_auth_id IS NULL THEN
    RAISE EXCEPTION 'Target system user not found or not active. System user ID: %', target_system_user_id;
  END IF;
  
  -- Validate date range
  IF req_start_date > req_end_date THEN
    RAISE EXCEPTION 'Start date cannot be after end date';
  END IF;
  
  -- Calculate working days
  total_working_days := calculate_working_days(req_start_date, req_end_date);
  
  -- Create the holiday request using both user_id and system_user_id
  INSERT INTO public.holiday_requests (
    user_id,
    system_user_id,
    absence_type,
    start_date,
    end_date,
    total_days,
    reason,
    status,
    created_at,
    updated_at
  ) VALUES (
    target_user_auth_id,  -- Keep for compatibility
    target_system_user_id,  -- The actual system user
    req_absence_type,
    req_start_date,
    req_end_date,
    total_working_days,
    req_reason,
    'pending'::request_status,
    now(),
    now()
  ) RETURNING id INTO new_request_id;
  
  -- Log the admin action
  INSERT INTO public.sensitive_data_access_log (
    accessed_by,
    employee_user_id,
    data_type,
    access_reason
  ) VALUES (
    auth.uid(),
    target_user_auth_id,
    'create_holiday_request_admin',
    format('Admin (%s) created holiday request for %s (system_user %s): %s from %s to %s', 
           current_user_role, target_user_name, target_system_user_id, req_absence_type, req_start_date, req_end_date)
  );
  
  RETURN new_request_id;
END;
$$;