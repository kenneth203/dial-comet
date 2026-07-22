
-- 1. Drop and recreate the profiles update policy to prevent self-reactivation
DROP POLICY IF EXISTS "profiles_admin_only_update" ON public.profiles;

CREATE POLICY "profiles_admin_only_update" ON public.profiles
FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid()) OR 
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'Super-Admin'::user_role 
    AND p.status = 'Active'::user_status
  ))
)
WITH CHECK (
  -- Super-Admins can do anything
  (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'Super-Admin'::user_role 
    AND p.status = 'Active'::user_status
  ))
  OR
  -- Non-Super-Admins: cannot escalate role AND cannot change their own status
  (
    (role <> ALL (ARRAY['Super-Admin'::user_role, 'Admin'::user_role, 'HR'::user_role, 'Supervisor'::user_role]))
    AND (status = (SELECT p2.status FROM profiles p2 WHERE p2.user_id = auth.uid()))
  )
);

-- 2. Create a security definer function to suspend user and delete password
-- when their profile status is set to Inactive
CREATE OR REPLACE FUNCTION public.handle_profile_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When status changes to 'Inactive', suspend the auth account
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'Inactive'::user_status THEN
    -- Ban the user in auth (this suspends their account and invalidates sessions)
    UPDATE auth.users 
    SET 
      banned_until = '2999-12-31T23:59:59Z'::timestamptz,
      encrypted_password = '',
      updated_at = now()
    WHERE id = NEW.user_id;

    -- Force status to Suspended
    NEW.status := 'Suspended'::user_status;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS trigger_profile_deactivation ON public.profiles;

CREATE TRIGGER trigger_profile_deactivation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_deactivation();
