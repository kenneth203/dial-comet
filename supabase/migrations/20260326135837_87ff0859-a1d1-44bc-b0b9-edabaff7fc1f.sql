-- Fix audit trigger used during admin user creation so it never references missing trigger-record fields
-- and never aborts auth/admin writes such as auth user provisioning.
CREATE OR REPLACE FUNCTION public.audit_sensitive_modifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  employee_identifier_text text;
  employee_identifier_uuid uuid;
  new_row jsonb := to_jsonb(NEW);
  old_row jsonb := to_jsonb(OLD);
BEGIN
  employee_identifier_text := COALESCE(
    new_row ->> 'auth_user_id',
    old_row ->> 'auth_user_id',
    new_row ->> 'user_id',
    old_row ->> 'user_id',
    new_row ->> 'id',
    old_row ->> 'id'
  );

  IF employee_identifier_text IS NOT NULL
     AND employee_identifier_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    employee_identifier_uuid := employee_identifier_text::uuid;
  ELSE
    employee_identifier_uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  INSERT INTO public.sensitive_data_access_log (
    accessed_by,
    employee_user_id,
    data_type,
    access_reason
  ) VALUES (
    current_user_id,
    employee_identifier_uuid,
    TG_OP || '_SENSITIVE_' || TG_TABLE_NAME,
    'Data modification'
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    -- Audit logging must never block the underlying write operation.
    RETURN COALESCE(NEW, OLD);
END;
$function$;