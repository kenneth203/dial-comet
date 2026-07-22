-- Data repair: Fix holiday_requests where user_id doesn't match the actual request owner
-- This fixes historical data where admins created requests for staff but the user_id was set to admin's ID

DO $$
DECLARE
    request_record RECORD;
    correct_user_id UUID;
BEGIN
    -- Find holiday_requests where user_id doesn't match the system_user's user_id
    FOR request_record IN 
        SELECT hr.id, hr.user_id, hr.system_user_id, su.user_id as correct_user_id
        FROM holiday_requests hr
        LEFT JOIN system_users su ON su.id = hr.system_user_id
        WHERE hr.system_user_id IS NOT NULL 
        AND su.user_id IS NOT NULL
        AND hr.user_id != su.user_id
    LOOP
        -- Update the holiday_request to have the correct user_id
        UPDATE holiday_requests 
        SET user_id = request_record.correct_user_id
        WHERE id = request_record.id;
        
        RAISE NOTICE 'Fixed holiday_request ID % - changed user_id from % to %', 
            request_record.id, request_record.user_id, request_record.correct_user_id;
    END LOOP;
    
    -- Also ensure the trigger is working for future requests
    RAISE NOTICE 'Data repair completed. Holiday requests now properly reference the correct user_id.';
END $$;