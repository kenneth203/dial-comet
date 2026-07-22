-- Fix remaining security issues

-- Remove the security definer view that was created earlier
DROP VIEW IF EXISTS public.user_names;

-- Check for any remaining functions without proper search_path
SELECT 
  schemaname, 
  proname, 
  prosecdef,
  proconfig
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE schemaname = 'public' 
  AND proname NOT LIKE 'uuid_%'
  AND proname NOT LIKE 'gen_%';