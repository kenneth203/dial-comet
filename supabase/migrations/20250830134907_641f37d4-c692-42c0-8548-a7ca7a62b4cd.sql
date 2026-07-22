-- First, let's see what functions exist that might be conflicting
SELECT 
    routine_name, 
    routine_type,
    data_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND (routine_name LIKE '%holiday%' OR routine_name LIKE '%system_user%')
ORDER BY routine_name;