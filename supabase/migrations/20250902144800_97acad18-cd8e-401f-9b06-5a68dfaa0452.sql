-- Fix the audit function to handle NULL employee_user_id properly
CREATE OR REPLACE FUNCTION public.audit_system_users_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    target_user_id uuid;
    current_user_id uuid;
BEGIN
    -- Get the current authenticated user
    current_user_id := auth.uid();
    
    -- Determine the target user ID from the record being modified
    IF TG_OP = 'DELETE' THEN
        target_user_id := OLD.user_id;
    ELSE
        target_user_id := NEW.user_id;
    END IF;
    
    -- If we still don't have a target user ID, skip audit logging
    -- This can happen with system operations or bulk updates
    IF target_user_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- If no authenticated user (system operation), use the target user as the accessor
    IF current_user_id IS NULL THEN
        current_user_id := target_user_id;
    END IF;
    
    -- Log the modification with proper user IDs
    INSERT INTO public.system_users_audit_log (
        accessed_by, 
        employee_user_id, 
        access_type, 
        access_reason, 
        risk_score, 
        fields_accessed
    ) VALUES (
        current_user_id,
        target_user_id,
        TG_OP || '_SYSTEM_USER',
        'Direct table modification by ' || TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN 30 ELSE 20 END,
        ARRAY['all_fields']
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$;