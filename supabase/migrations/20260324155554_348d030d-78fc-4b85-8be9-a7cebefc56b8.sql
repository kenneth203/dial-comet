CREATE OR REPLACE FUNCTION public.audit_system_users_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    accessor_user_id uuid;
    target_user_id uuid;
BEGIN
    accessor_user_id := auth.uid();
    target_user_id := COALESCE(NEW.user_id, OLD.user_id);

    -- If there is no user associated with the record, skip audit logging.
    IF target_user_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Service-role and other system operations may not have auth.uid().
    -- Fall back to the target user id so audit rows remain valid.
    IF accessor_user_id IS NULL THEN
        accessor_user_id := target_user_id;
    END IF;

    INSERT INTO public.system_users_audit_log (
        accessed_by,
        employee_user_id,
        access_type,
        access_reason,
        fields_accessed,
        risk_score
    ) VALUES (
        accessor_user_id,
        target_user_id,
        TG_OP,
        'System_users_table_' || TG_OP,
        ARRAY['system_user_data'],
        CASE 
            WHEN TG_OP = 'UPDATE' THEN 10
            WHEN TG_OP = 'INSERT' THEN 8
            WHEN TG_OP = 'DELETE' THEN 15
            ELSE 20
        END
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;