-- Temporarily disable audit trigger to allow system-level cleanup
DROP TRIGGER IF EXISTS audit_system_users_trigger ON public.system_users;

-- Step 1: Make system_users.user_id nullable
ALTER TABLE public.system_users ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Identify and fix ALL duplicate user_id records
WITH duplicate_users AS (
  SELECT user_id, COUNT(*) as count
  FROM public.system_users 
  WHERE user_id IS NOT NULL
  GROUP BY user_id 
  HAVING COUNT(*) > 1
),
ranked_records AS (
  SELECT 
    su.id,
    su.user_id,
    su.name,
    ROW_NUMBER() OVER (
      PARTITION BY su.user_id 
      ORDER BY 
        -- Prioritize Kenneth Pote's correct record
        CASE WHEN su.user_id = '34f29a26-75e4-4730-9c1a-2a2e8fad7c9b' AND su.name = 'Kenneth Pote' THEN 1 ELSE 2 END,
        -- Then prioritize records with email
        CASE WHEN su.email IS NOT NULL THEN 1 ELSE 2 END,
        su.created_at ASC
    ) as row_num
  FROM public.system_users su
  INNER JOIN duplicate_users du ON su.user_id = du.user_id
)
-- Detach duplicate records
UPDATE public.system_users 
SET user_id = NULL 
WHERE id IN (
  SELECT id FROM ranked_records WHERE row_num > 1
);

-- Step 3: Add unique constraint
ALTER TABLE public.system_users 
ADD CONSTRAINT unique_system_users_user_id 
UNIQUE (user_id);

-- Step 4: Clean up orphaned holiday_requests
DELETE FROM public.holiday_requests 
WHERE system_user_id IN (
  SELECT id FROM public.system_users WHERE user_id IS NULL
);

-- Step 5: Re-enable audit trigger (if the function exists)
CREATE TRIGGER audit_system_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.system_users
  FOR EACH ROW
  EXECUTE FUNCTION audit_system_users_changes();