-- Manually fix the user mapping - clear Kenneth's user_id from Kate's row and assign it to Kenneth's row
DO $$
DECLARE 
    kenneth_auth_id UUID;
    kenneth_row_id UUID;
    kate_row_id UUID;
BEGIN
    -- Find Kenneth's auth ID by looking for the email in auth.users 
    -- (assuming Kenneth's email is different from Kate's)
    
    -- First, let's clear any incorrect mappings
    -- Find Kate's system_users row (the one with Kate's email but potentially Kenneth's user_id)
    SELECT id INTO kate_row_id 
    FROM public.system_users 
    WHERE email = 'kate@belocalgroup.co.uk' 
    LIMIT 1;
    
    -- Find Kenneth's system_users row (the one with Kenneth's email)
    SELECT id INTO kenneth_row_id 
    FROM public.system_users 
    WHERE email = 'kenneth@belocalgroup.co.uk' 
    LIMIT 1;
    
    -- Clear any user_id from Kate's row
    IF kate_row_id IS NOT NULL THEN
        UPDATE public.system_users 
        SET user_id = NULL 
        WHERE id = kate_row_id;
    END IF;
    
    -- Find Kenneth's correct auth ID 
    SELECT id INTO kenneth_auth_id 
    FROM auth.users 
    WHERE email = 'kenneth@belocalgroup.co.uk' 
    LIMIT 1;
    
    -- Assign Kenneth's auth ID to Kenneth's system_users row
    IF kenneth_row_id IS NOT NULL AND kenneth_auth_id IS NOT NULL THEN
        UPDATE public.system_users 
        SET user_id = kenneth_auth_id 
        WHERE id = kenneth_row_id;
    END IF;
    
    RAISE NOTICE 'User mapping repair completed. Kenneth auth ID: %, Kenneth row: %, Kate row: %', 
        kenneth_auth_id, kenneth_row_id, kate_row_id;
END $$;