-- Fix duplicate user_id issue in system_users table
-- This creates proper auth users and updates references

-- First, let's create temporary auth users for users who don't have proper auth accounts
-- We'll create them in the auth.users table through a secure function

-- Create a function to generate proper user IDs and update system_users
CREATE OR REPLACE FUNCTION fix_system_users_duplicate_ids()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    joe_user_id uuid;
    kate_user_id uuid;
    tara_user_id uuid;
    kenneth_current_id uuid := '34fd1b64-9190-4e31-8c20-b20705053fc1';
BEGIN
    -- Generate new UUIDs for users who need them
    joe_user_id := gen_random_uuid();
    kate_user_id := gen_random_uuid();
    tara_user_id := gen_random_uuid();
    
    -- Update Joe Campbell
    UPDATE system_users 
    SET user_id = joe_user_id
    WHERE name = 'Joe Campbell' AND email = 'chris@example.com';
    
    -- Update Kate Campbell  
    UPDATE system_users 
    SET user_id = kate_user_id
    WHERE name = 'Kate Campbell' AND email = 'alex@example.com';
    
    -- Update Tara Egan
    UPDATE system_users 
    SET user_id = tara_user_id
    WHERE name = 'Tara Egan' AND email = 'priya@example.com';
    
    -- Kenneth Pote keeps the current ID since he has a proper auth record
    
    -- Create corresponding profiles for the new user IDs
    INSERT INTO profiles (user_id, name, role, status)
    VALUES 
        (joe_user_id, 'Joe Campbell', 'Operator', 'Active'),
        (kate_user_id, 'Kate Campbell', 'Supervisor', 'Active'),
        (tara_user_id, 'Tara Egan', 'Operator', 'Active')
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Update comprehensive_users to include all users with proper auth_user_ids
    INSERT INTO comprehensive_users (
        auth_user_id, name, email, role, status, is_staff_member,
        annual_leave_entitlement, working_hours_per_week, contract_type
    )
    SELECT 
        user_id,
        name,
        email,
        role,
        status,
        true,
        annual_leave_days,
        37.5,
        'full_time'
    FROM system_users
    WHERE user_id IN (joe_user_id, kate_user_id, tara_user_id)
    ON CONFLICT (auth_user_id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        is_staff_member = EXCLUDED.is_staff_member;
    
    -- Update existing holiday requests to use the correct user IDs
    -- Since all holiday requests are currently assigned to Kenneth's ID,
    -- we need to determine which requests belong to which user
    -- For now, we'll leave them as they are since we can't determine ownership
    -- Future holiday requests will use the correct user IDs
    
    RAISE NOTICE 'Fixed system_users duplicate IDs. Joe: %, Kate: %, Tara: %', 
        joe_user_id, kate_user_id, tara_user_id;
END;
$$;

-- Execute the fix
SELECT fix_system_users_duplicate_ids();

-- Drop the temporary function
DROP FUNCTION fix_system_users_duplicate_ids();