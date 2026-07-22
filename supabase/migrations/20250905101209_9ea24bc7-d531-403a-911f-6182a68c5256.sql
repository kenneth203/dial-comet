-- Fix the audit trigger to work with comprehensive_users table structure
CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only log actual data changes, not just queries
  IF TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    INSERT INTO public.sensitive_data_access_log (
      accessed_by,
      employee_user_id,
      data_type,
      access_reason
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.auth_user_id, OLD.auth_user_id), -- Use auth_user_id for comprehensive_users
      TG_OP || '_' || TG_TABLE_NAME,
      CASE 
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