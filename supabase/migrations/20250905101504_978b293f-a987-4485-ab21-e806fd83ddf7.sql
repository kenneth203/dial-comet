-- Fix all audit functions to handle comprehensive_users table schema
-- Update audit_sensitive_modifications function
CREATE OR REPLACE FUNCTION public.audit_sensitive_modifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  employee_identifier TEXT;
  current_user_id UUID;
BEGIN
  current_user_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID);
  employee_identifier := COALESCE(NEW.auth_user_id::text, OLD.auth_user_id::text, NEW.id::text, OLD.id::text);
  
  -- Log the modification
  INSERT INTO public.sensitive_data_access_log (
    accessed_by,
    employee_user_id,
    data_type,
    access_reason
  ) VALUES (
    current_user_id,
    COALESCE(employee_identifier::UUID, '00000000-0000-0000-0000-000000000000'::UUID),
    TG_OP || '_SENSITIVE_' || TG_TABLE_NAME,
    'Data modification'
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;