
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
    
    SELECT role::TEXT INTO user_role 
    FROM public.profiles 
    WHERE user_id = current_uid;
    
    IF user_role != 'Super-Admin' THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    IF confirmation_code != 'RESET_ALL_DATA_CONFIRM' THEN
        RAISE EXCEPTION 'Invalid confirmation code';
    END IF;
    
    -- Log the reset operation
    INSERT INTO public.staff_data_access_audit (
        accessed_by, employee_user_id, data_type, access_reason, risk_score
    ) VALUES (
        current_uid, current_uid, 'DATABASE_RESET', 'Complete database reset performed', 10
    );
    
    -- Use TRUNCATE CASCADE to bypass RLS and handle foreign keys
    TRUNCATE public.task_attachments CASCADE;
    TRUNCATE public.project_tasks CASCADE;
    TRUNCATE public.todos CASCADE;
    TRUNCATE public.billing_line_items CASCADE;
    TRUNCATE public.billing_periods CASCADE;
    TRUNCATE public.billing_invoices CASCADE;
    TRUNCATE public.call_logs CASCADE;
    TRUNCATE public.import_batches CASCADE;
    TRUNCATE public.customers CASCADE;
    TRUNCATE public.news_items CASCADE;
    TRUNCATE public.holiday_requests CASCADE;
    TRUNCATE public.status_timing_logs CASCADE;
    TRUNCATE public.task_notifications CASCADE;
    TRUNCATE public.chat_messages CASCADE;
    TRUNCATE public.chat_message_reads CASCADE;
    TRUNCATE public.chat_room_members CASCADE;
    TRUNCATE public.chat_rooms CASCADE;
    TRUNCATE public.noticeboard CASCADE;
    
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
