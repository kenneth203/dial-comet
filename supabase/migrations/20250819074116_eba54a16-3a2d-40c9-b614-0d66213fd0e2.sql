-- Fix critical security and data integrity issues (handle orphaned data)

-- 1. Clean up orphaned staff_details records before adding constraints
-- Remove staff_details records that reference non-existent users
DELETE FROM public.staff_details 
WHERE user_id IS NOT NULL 
AND user_id NOT IN (SELECT id FROM auth.users);

-- Remove staff_details records with NULL user_id that can't be matched
DELETE FROM public.staff_details 
WHERE user_id IS NULL;

-- Now make the column NOT NULL
ALTER TABLE public.staff_details 
ALTER COLUMN user_id SET NOT NULL;

-- 2. Create trigger for comprehensive audit logging of sensitive data access
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

-- 3. Create proper backend validation function for admin roles
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

-- 4. Add constraints for data validation
ALTER TABLE public.holiday_entitlements
ADD CONSTRAINT IF NOT EXISTS check_positive_days 
CHECK (annual_leave_days >= 0 AND sick_leave_days >= 0 AND personal_days >= 0);

-- 5. Ensure all user references are properly linked (with cascade delete for data integrity)
ALTER TABLE public.comprehensive_users
DROP CONSTRAINT IF EXISTS fk_comprehensive_users_auth_user;

ALTER TABLE public.comprehensive_users
ADD CONSTRAINT fk_comprehensive_users_auth_user
FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.staff_details
DROP CONSTRAINT IF EXISTS fk_staff_details_user;

ALTER TABLE public.staff_details
ADD CONSTRAINT fk_staff_details_user
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 6. Update RLS policies to use secure backend validation
-- Update noticeboard policies to use the new validation function
DROP POLICY IF EXISTS "Admin and Supervisor can insert noticeboard content" ON public.noticeboard;
CREATE POLICY "Admin and Supervisor can insert noticeboard content"
ON public.noticeboard FOR INSERT
WITH CHECK (public.validate_admin_action(ARRAY['Admin', 'Super-Admin', 'Supervisor']));

DROP POLICY IF EXISTS "Admin and Supervisor can update noticeboard content" ON public.noticeboard;
CREATE POLICY "Admin and Supervisor can update noticeboard content"
ON public.noticeboard FOR UPDATE
USING (public.validate_admin_action(ARRAY['Admin', 'Super-Admin', 'Supervisor']));

DROP POLICY IF EXISTS "Admin and Supervisor can delete noticeboard content" ON public.noticeboard;
CREATE POLICY "Admin and Supervisor can delete noticeboard content"
ON public.noticeboard FOR DELETE
USING (public.validate_admin_action(ARRAY['Admin', 'Super-Admin', 'Supervisor']));