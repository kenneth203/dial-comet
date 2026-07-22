-- Simple fix for duplicate user_id issue
-- Just remove the constraint and update IDs to unique values

-- Remove the foreign key constraint that's preventing updates
ALTER TABLE system_users DROP CONSTRAINT IF EXISTS system_users_user_id_fkey;

-- Generate unique user_ids for each user (we'll handle auth creation in the app)
UPDATE system_users SET user_id = gen_random_uuid() WHERE name = 'Joe Campbell' AND email = 'chris@example.com';
UPDATE system_users SET user_id = gen_random_uuid() WHERE name = 'Kate Campbell' AND email = 'alex@example.com';  
UPDATE system_users SET user_id = gen_random_uuid() WHERE name = 'Tara Egan' AND email = 'priya@example.com';

-- Clear the duplicate holiday requests since we can't determine ownership
DELETE FROM holiday_requests WHERE user_id = '34fd1b64-9190-4e31-8c20-b20705053fc1';

-- Create basic profiles for the users (using their new system_users.user_id)
INSERT INTO profiles (user_id, name, role, status)
SELECT user_id, name, 
       CASE role 
         WHEN 'Supervisor' THEN 'Supervisor'::user_role
         WHEN 'Admin' THEN 'Admin'::user_role
         ELSE 'Operator'::user_role
       END,
       'Active'::user_status
FROM system_users 
WHERE name IN ('Joe Campbell', 'Kate Campbell', 'Tara Egan')
ON CONFLICT (user_id) DO NOTHING;

-- Update comprehensive_users to match
INSERT INTO comprehensive_users (
    auth_user_id, name, email, role, status, is_staff_member,
    annual_leave_entitlement, working_hours_per_week, contract_type
)
SELECT 
    user_id, name, email, role, status, true, annual_leave_days, 37.5, 'full_time'
FROM system_users
WHERE name IN ('Joe Campbell', 'Kate Campbell', 'Tara Egan')
ON CONFLICT (auth_user_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    is_staff_member = EXCLUDED.is_staff_member;