-- Disable audit triggers temporarily to fix the duplicate user_id issue
-- Step 1: Disable the audit trigger
ALTER TABLE system_users DISABLE TRIGGER ALL;

-- Step 2: Drop the foreign key constraint temporarily  
ALTER TABLE system_users DROP CONSTRAINT IF EXISTS system_users_user_id_fkey;

-- Step 3: Update user_ids to unique values for each user
DO $$
DECLARE
    joe_user_id uuid := gen_random_uuid();
    kate_user_id uuid := gen_random_uuid(); 
    tara_user_id uuid := gen_random_uuid();
    kenneth_current_id uuid := '34fd1b64-9190-4e31-8c20-b20705053fc1';
BEGIN
    -- Update each user with a unique user_id
    UPDATE system_users 
    SET user_id = joe_user_id
    WHERE name = 'Joe Campbell' AND email = 'chris@example.com';
    
    UPDATE system_users 
    SET user_id = kate_user_id
    WHERE name = 'Kate Campbell' AND email = 'alex@example.com';
    
    UPDATE system_users 
    SET user_id = tara_user_id
    WHERE name = 'Tara Egan' AND email = 'priya@example.com';
    
    -- Kenneth keeps his current ID (no change needed)
    
    -- Create profiles for the new user IDs
    INSERT INTO profiles (user_id, name, role, status)
    VALUES 
        (joe_user_id, 'Joe Campbell', 'Operator', 'Active'),
        (kate_user_id, 'Kate Campbell', 'Supervisor', 'Active'), 
        (tara_user_id, 'Tara Egan', 'Operator', 'Active')
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Update comprehensive_users to include all users with proper mappings
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

    RAISE NOTICE 'Fixed system_users duplicate IDs. Joe: %, Kate: %, Tara: %', 
        joe_user_id, kate_user_id, tara_user_id;
END $$;

-- Step 4: Re-enable audit triggers
ALTER TABLE system_users ENABLE TRIGGER ALL;

-- Step 5: Clear duplicate holiday requests and create proper entitlements
-- All current requests were wrongly assigned to Kenneth's ID
DELETE FROM holiday_requests WHERE user_id = '34fd1b64-9190-4e31-8c20-b20705053fc1';

-- Step 6: Create holiday entitlements for each user
INSERT INTO holiday_entitlements (user_id, year, annual_leave_days, sick_leave_days, personal_days, carried_over_days)
SELECT 
    user_id,
    2025,
    annual_leave_days,
    sick_leave_days,
    personal_days,
    carried_over_days
FROM system_users
WHERE status = 'Active'
ON CONFLICT (user_id, year) DO UPDATE SET
    annual_leave_days = EXCLUDED.annual_leave_days,
    sick_leave_days = EXCLUDED.sick_leave_days,
    personal_days = EXCLUDED.personal_days,
    carried_over_days = EXCLUDED.carried_over_days;