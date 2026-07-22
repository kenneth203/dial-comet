-- Fix the duplicate user_id issue in system_users table
-- First, let's create unique user_ids for each system user

-- Update Joe Campbell to have a unique user_id
UPDATE public.system_users 
SET user_id = gen_random_uuid()
WHERE name = 'Joe Campbell' AND email = 'chris@example.com';

-- Update Kate Campbell to have a unique user_id  
UPDATE public.system_users 
SET user_id = gen_random_uuid()
WHERE name = 'Kate Campbell' AND email = 'alex@example.com';

-- Update Tara Egan to have a unique user_id
UPDATE public.system_users 
SET user_id = gen_random_uuid()
WHERE name = 'Tara Egan' AND email = 'priya@example.com';

-- Kenneth Pote can keep the current user_id since they're the main admin user

-- Now let's create corresponding auth.users entries for the new user_ids
-- Note: In a real system, these would be created through the auth flow
-- For now, we'll create placeholder entries

DO $$
DECLARE
    joe_user_id uuid;
    kate_user_id uuid; 
    tara_user_id uuid;
BEGIN
    -- Get the new user_ids
    SELECT user_id INTO joe_user_id FROM public.system_users WHERE name = 'Joe Campbell' AND email = 'chris@example.com';
    SELECT user_id INTO kate_user_id FROM public.system_users WHERE name = 'Kate Campbell' AND email = 'alex@example.com';
    SELECT user_id INTO tara_user_id FROM public.system_users WHERE name = 'Tara Egan' AND email = 'priya@example.com';
    
    -- Create profile entries for each user
    INSERT INTO public.profiles (user_id, name, role, status) VALUES
    (joe_user_id, 'Joe Campbell', 'Operator', 'Active'),
    (kate_user_id, 'Kate Campbell', 'Supervisor', 'Active'),
    (tara_user_id, 'Tara Egan', 'Operator', 'Active')
    ON CONFLICT (user_id) DO NOTHING;
END $$;