
CREATE OR REPLACE FUNCTION public.perform_database_reset(confirmation_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role TEXT;
    current_uid UUID;
BEGIN
    current_uid := auth.uid();
    
    -- Verify user is Super-Admin
    SELECT role::TEXT INTO user_role 
    FROM public.profiles 
    WHERE user_id = current_uid;
    
    IF user_role != 'Super-Admin' THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    -- Verify confirmation code
    IF confirmation_code != 'RESET_ALL_DATA_CONFIRM' THEN
        RAISE EXCEPTION 'Invalid confirmation code';
    END IF;
    
    -- Log the reset operation
    INSERT INTO public.staff_data_access_audit (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason,
        risk_score
    ) VALUES (
        current_uid,
        current_uid,
        'DATABASE_RESET',
        'Complete database reset performed',
        10
    );
    
    -- Perform selective data cleanup (preserve system config and user accounts)
    DELETE FROM public.task_attachments;
    DELETE FROM public.project_tasks;
    DELETE FROM public.todos;
    DELETE FROM public.customers;
    DELETE FROM public.news_items;
    DELETE FROM public.billing_line_items;
    DELETE FROM public.billing_periods;
    DELETE FROM public.billing_invoices;
    DELETE FROM public.call_logs;
    DELETE FROM public.import_batches;
    DELETE FROM public.holiday_requests;
    DELETE FROM public.status_timing_logs;
    DELETE FROM public.task_notifications;
    DELETE FROM public.chat_messages;
    DELETE FROM public.chat_message_reads;
    DELETE FROM public.chat_room_members;
    DELETE FROM public.chat_rooms;
    DELETE FROM public.noticeboard;
    
    -- Reset holiday entitlements to defaults
    UPDATE public.holiday_entitlements 
    SET 
        annual_leave_days = 25.0,
        sick_leave_days = 10.0,
        personal_days = 5.0,
        carried_over_days = 0.0;
    
    RETURN true;
END;
$$;
