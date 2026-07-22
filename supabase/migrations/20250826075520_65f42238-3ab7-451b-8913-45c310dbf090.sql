-- Fix search path for audit function
CREATE OR REPLACE FUNCTION public.audit_comprehensive_users_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path TO 'public'
AS $$
BEGIN
  -- Log any modifications to sensitive employee data
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      timestamp
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.id::text, OLD.id::text),
      TG_OP || '_COMPREHENSIVE_USERS',
      NOW()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;