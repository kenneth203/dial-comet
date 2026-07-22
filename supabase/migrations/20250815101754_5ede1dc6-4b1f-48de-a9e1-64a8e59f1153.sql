-- Fix remaining security issues

-- Remove the security definer view that was created earlier
DROP VIEW IF EXISTS public.user_names;

-- Check for any remaining functions without proper search_path
SELECT 
  n.nspname as schema_name, 
  p.proname as function_name, 
  p.prosecdef as is_security_definer,
  p.proconfig as config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname NOT LIKE 'uuid_%'
  AND p.proname NOT LIKE 'gen_%';