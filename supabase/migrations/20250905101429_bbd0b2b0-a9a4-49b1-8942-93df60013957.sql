-- Fix the audit trigger to handle NULL employee_user_id as well
CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id UUID;
  employee_id UUID;
BEGIN
  -- Get current user ID, use a system UUID if NULL (for migrations/system operations)
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    current_user_id := '00000000-0000-0000-0000-000000000000'::UUID; -- System operation marker
  END IF;
  
  -- Get employee user ID, use system UUID if NULL
  employee_id := COALESCE(NEW.auth_user_id, OLD.auth_user_id);
  IF employee_id IS NULL THEN
    employee_id := '00000000-0000-0000-0000-000000000000'::UUID; -- No auth user linked
  END IF;
  
  -- Only log actual data changes, not just queries
  IF TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    INSERT INTO public.sensitive_data_access_log (
      accessed_by,
      employee_user_id,
      data_type,
      access_reason
    ) VALUES (
      current_user_id,
      employee_id,
      TG_OP || '_' || TG_TABLE_NAME,
      CASE 
        WHEN current_user_id = '00000000-0000-0000-0000-000000000000'::UUID THEN 'System operation'
        WHEN TG_OP = 'INSERT' THEN 'User creation'
        WHEN TG_OP = 'UPDATE' THEN 'User update'  
        WHEN TG_OP = 'DELETE' THEN 'User deletion'
        ELSE 'Data access'
      END
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;