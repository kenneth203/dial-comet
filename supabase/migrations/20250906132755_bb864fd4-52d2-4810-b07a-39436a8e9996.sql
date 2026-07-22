-- Fix the list_system_users_minimal function with better error handling and logging
CREATE OR REPLACE FUNCTION public.list_system_users_minimal()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
    current_user_id uuid;
    user_role text;
BEGIN
    -- Get current user ID
    current_user_id := auth.uid();
    
    -- Log current user for debugging (this will show in Supabase logs)
    RAISE NOTICE 'Current user ID: %', current_user_id;
    
    -- If no user is authenticated, return empty
    IF current_user_id IS NULL THEN
        RAISE NOTICE 'No authenticated user found';
        RETURN;
    END IF;
    
    -- Get user role
    SELECT p.role::text INTO user_role
    FROM public.profiles p
    WHERE p.user_id = current_user_id;
    
    RAISE NOTICE 'User role: %', user_role;
    
    -- Check if user has required role
    IF user_role NOT IN ('HR', 'Admin', 'Super-Admin') THEN
        RAISE NOTICE 'User does not have required role. Current role: %', user_role;
        RETURN;
    END IF;
    
    -- Return system users
    RETURN QUERY
    SELECT 
        su.id,
        su.name
    FROM public.system_users su
    WHERE su.status = 'Active'
        AND su.name IS NOT NULL
        AND su.name != ''
    ORDER BY su.name;
END;
$function$;