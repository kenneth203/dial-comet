-- Create a profile for the current user if they don't have one
-- This will allow them to access staff management functions
INSERT INTO public.profiles (user_id, name, role, status)
SELECT 
  auth.uid(), 
  'Admin User', 
  'Super-Admin'::user_role, 
  'Active'::user_status
WHERE auth.uid() IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid()
  );