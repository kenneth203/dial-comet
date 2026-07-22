-- Check and fix the profiles table policies

-- List current policies first
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'profiles' AND schemaname = 'public';

-- Create the security functions first
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
RETURNS BOOLEAN AS $$
  SELECT CASE 
    WHEN public.get_current_user_role() IN ('Super-Admin', 'Admin', 'Supervisor') THEN true
    ELSE false
  END
$$ LANGUAGE SQL SECURITY DEFINER STABLE;