-- Fix data integrity issue with duplicate user_id mappings in system_users
-- First, let's see what we're working with and then fix the duplicate mappings

-- Create unique auth user records for Joe Campbell and Kate Campbell if they don't exist
-- We'll generate new UUIDs for them since they should have separate auth accounts

-- Update Joe Campbell to have a unique user_id
UPDATE public.system_users 
SET user_id = gen_random_uuid()
WHERE id = '5e403989-e6e7-4f55-9a7c-65db72b35d9a' 
  AND name = 'Joe Campbell';

-- Update Kate Campbell to have a unique user_id  
UPDATE public.system_users 
SET user_id = gen_random_uuid()
WHERE id = 'c4cfb065-881d-4c4c-9129-b6f3659599ac' 
  AND name = 'Kate Campbell';

-- Create corresponding profiles for these users if they don't exist
INSERT INTO public.profiles (user_id, name, role, status)
SELECT 
  su.user_id,
  su.name,
  su.role::user_role,
  su.status::user_status
FROM public.system_users su
WHERE su.id IN ('5e403989-e6e7-4f55-9a7c-65db72b35d9a', 'c4cfb065-881d-4c4c-9129-b6f3659599ac')
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  status = EXCLUDED.status;