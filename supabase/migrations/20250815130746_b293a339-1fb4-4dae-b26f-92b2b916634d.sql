-- Fix the security issues by updating function search paths
-- Update get_current_user_role function
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT role FROM public.profiles WHERE user_id = auth.uid()
$function$;

-- Update is_admin_or_higher function  
CREATE OR REPLACE FUNCTION public.is_admin_or_higher()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT CASE 
    WHEN public.get_current_user_role() IN ('Super-Admin', 'Admin', 'Supervisor') THEN true
    ELSE false
  END
$function$;

-- Update get_user_name function
CREATE OR REPLACE FUNCTION public.get_user_name(user_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT name FROM public.profiles WHERE user_id = user_uuid
$function$;