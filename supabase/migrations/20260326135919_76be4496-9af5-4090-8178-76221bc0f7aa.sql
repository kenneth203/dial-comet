-- Fix the other audit function that also directly references NEW.auth_user_id
CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
RETURNS TRIGGER AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
  old_row jsonb := to_jsonb(OLD);
  emp_id text;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    emp_id := COALESCE(
      new_row ->> 'employee_id',
      old_row ->> 'employee_id',
      new_row ->> 'user_id',
      old_row ->> 'user_id',
      new_row ->> 'auth_user_id',
      old_row ->> 'auth_user_id',
      new_row ->> 'id',
      old_row ->> 'id'
    );

    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      ip_address
    ) VALUES (
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      emp_id,
      TG_OP || '_' || TG_TABLE_NAME,
      NULL
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public';