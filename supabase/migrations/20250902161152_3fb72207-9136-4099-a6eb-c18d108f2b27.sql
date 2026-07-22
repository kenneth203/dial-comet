-- Fix the repair function to handle unique constraint properly
CREATE OR REPLACE FUNCTION public.repair_current_user_mapping()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    current_user_email TEXT;
    current_auth_uid UUID;
    correct_system_user_id UUID;
    incorrect_system_user_id UUID;
BEGIN
    -- Get current user's email and auth uid
    SELECT email INTO current_user_email FROM auth.users WHERE id = auth.uid();
    current_auth_uid := auth.uid();
    
    IF current_user_email IS NULL THEN
        RETURN; -- No authenticated user
    END IF;
    
    -- Find the system_users row that should belong to this user (by email)
    SELECT id INTO correct_system_user_id 
    FROM public.system_users 
    WHERE email = current_user_email 
    LIMIT 1;
    
    -- Find any system_users row that incorrectly has this user's auth uid
    SELECT id INTO incorrect_system_user_id 
    FROM public.system_users 
    WHERE user_id = current_auth_uid 
    AND email != current_user_email 
    LIMIT 1;
    
    -- FIRST: Clear any incorrect mappings to avoid unique constraint violations
    IF incorrect_system_user_id IS NOT NULL THEN
        UPDATE public.system_users 
        SET user_id = NULL 
        WHERE id = incorrect_system_user_id;
    END IF;
    
    -- SECOND: Update the correct row to have the correct user_id
    IF correct_system_user_id IS NOT NULL THEN
        UPDATE public.system_users 
        SET user_id = current_auth_uid 
        WHERE id = correct_system_user_id;
    END IF;
END;
$$;