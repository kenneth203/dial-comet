-- Fix critical security and data integrity issues

-- 1. Fix nullable staff_details.user_id field (data integrity issue)
ALTER TABLE public.staff_details 
ALTER COLUMN user_id SET NOT NULL;

-- 2. Reduce OTP expiry time from 24 hours to 30 minutes for better security
UPDATE auth.config 
SET value = '1800'::text  -- 30 minutes in seconds
WHERE parameter = 'otp_expiry';

-- 3. Create trigger for comprehensive audit logging of sensitive data access
CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log actual data changes, not just queries
  IF TG_OP IN ('INSERT', 'UPDATE', 'DELETE') THEN
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      ip_address
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.employee_id::text, OLD.employee_id::text, NEW.user_id::text, OLD.user_id::text),
      TG_OP || '_' || TG_TABLE_NAME,
      NULL  -- IP will be captured at application level
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to sensitive tables
DROP TRIGGER IF EXISTS audit_staff_details ON public.staff_details;
CREATE TRIGGER audit_staff_details
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_details
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_data_access();

DROP TRIGGER IF EXISTS audit_comprehensive_users ON public.comprehensive_users;
CREATE TRIGGER audit_comprehensive_users
  AFTER INSERT OR UPDATE OR DELETE ON public.comprehensive_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_data_access();

-- 4. Create proper backend validation function for admin roles
CREATE OR REPLACE FUNCTION public.validate_admin_action(required_roles text[] DEFAULT ARRAY['Admin', 'Super-Admin'])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role::text = ANY(required_roles)
    AND status::text = 'Active'
  );
$$;

-- 5. Add constraints for data validation
ALTER TABLE public.holiday_requests 
ADD CONSTRAINT check_valid_date_range 
CHECK (start_date <= end_date AND start_date >= CURRENT_DATE);

ALTER TABLE public.holiday_entitlements
ADD CONSTRAINT check_positive_days 
CHECK (annual_leave_days >= 0 AND sick_leave_days >= 0 AND personal_days >= 0);

-- 6. Ensure all user references are properly linked
ALTER TABLE public.comprehensive_users
ADD CONSTRAINT fk_comprehensive_users_auth_user
FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.staff_details
ADD CONSTRAINT fk_staff_details_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 7. Create function to safely get user role (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.get_user_role_secure(user_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = user_uuid LIMIT 1;
$$;