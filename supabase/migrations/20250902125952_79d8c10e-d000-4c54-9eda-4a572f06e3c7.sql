-- Fix holiday requests ownership issue
-- Step 1: Make system_users.user_id nullable to allow detaching orphaned records
ALTER TABLE public.system_users ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Identify the correct system_users record for Kenneth Pote (user_id: 34f29a26-75e4-4730-9c1a-2a2e8fad7c9b)
-- Keep only one system_users record linked to this auth user - prefer the one with most complete data
WITH user_system_records AS (
  SELECT 
    id,
    user_id,
    name,
    email,
    created_at,
    ROW_NUMBER() OVER (
      ORDER BY 
        CASE WHEN name = 'Kenneth Pote' THEN 1 ELSE 2 END,
        CASE WHEN email IS NOT NULL THEN 1 ELSE 2 END,
        created_at ASC
    ) as priority
  FROM public.system_users 
  WHERE user_id = '34f29a26-75e4-4730-9c1a-2a2e8fad7c9b'
),
correct_record AS (
  SELECT id as correct_system_user_id 
  FROM user_system_records 
  WHERE priority = 1
)
-- Detach other system_users records from this auth user
UPDATE public.system_users 
SET user_id = NULL 
WHERE user_id = '34f29a26-75e4-4730-9c1a-2a2e8fad7c9b'
  AND id NOT IN (SELECT correct_system_user_id FROM correct_record);

-- Step 3: Add unique constraint on system_users.user_id to prevent future duplicates
ALTER TABLE public.system_users 
ADD CONSTRAINT unique_system_users_user_id 
UNIQUE (user_id);

-- Step 4: Fix holiday_requests ownership - ensure all requests link to correct user and system_user
WITH correct_mapping AS (
  SELECT 
    su.id as correct_system_user_id,
    su.user_id as correct_user_id
  FROM public.system_users su
  WHERE su.user_id = '34f29a26-75e4-4730-9c1a-2a2e8fad7c9b'
)
UPDATE public.holiday_requests hr
SET 
  user_id = cm.correct_user_id,
  system_user_id = cm.correct_system_user_id
FROM correct_mapping cm
WHERE hr.user_id = '34f29a26-75e4-4730-9c1a-2a2e8fad7c9b' 
   OR hr.system_user_id IN (
     SELECT id FROM public.system_users WHERE user_id IS NULL
   );

-- Step 5: Clean up orphaned holiday_requests that don't belong to any valid user
DELETE FROM public.holiday_requests 
WHERE system_user_id IN (
  SELECT id FROM public.system_users WHERE user_id IS NULL
);