-- Critical Security Fixes Migration
-- 1. Fix shift_templates public access - restrict to admin/supervisor only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_templates' AND table_schema = 'public') THEN
    -- Drop existing permissive policies
    DROP POLICY IF EXISTS "Authenticated_users_can_view_shift_templates" ON public.shift_templates;
    DROP POLICY IF EXISTS "Admins_can_manage_shift_templates" ON public.shift_templates;
    
    -- Create restrictive policies - only admin/supervisor can view templates
    CREATE POLICY "Admin_supervisor_can_view_shift_templates" 
    ON public.shift_templates 
    FOR SELECT 
    USING (is_admin_or_higher());
    
    CREATE POLICY "Admin_supervisor_can_manage_shift_templates" 
    ON public.shift_templates 
    FOR ALL 
    USING (is_admin_or_higher())
    WITH CHECK (is_admin_or_higher());
    
    RAISE NOTICE 'Fixed shift_templates access - restricted to admin/supervisor only';
  ELSE
    RAISE NOTICE 'shift_templates table not found, skipping';
  END IF;
END $$;

-- 2. Create secure RPC to replace comprehensive_users direct access
CREATE OR REPLACE FUNCTION public.get_staff_directory_secure()
RETURNS TABLE(
  id uuid,
  name text,
  department text,
  job_position text,
  role text,
  status text,
  email text,
  phone_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get current user role
  SELECT p.role::TEXT INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Log access attempt
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), NULL, 'DIRECTORY_ACCESS', 'Staff directory lookup via secure RPC', 0
  );
  
  -- Return appropriate data based on role
  IF user_role IN ('HR', 'Admin', 'Super-Admin') THEN
    -- Full access for HR/Admin
    RETURN QUERY
    SELECT 
      cu.id, cu.name, cu.department, cu.job_position, cu.role, cu.status,
      cu.email, cu.phone_number
    FROM public.comprehensive_users cu
    WHERE cu.status = 'Active'
    ORDER BY cu.name;
  ELSE
    -- Limited access for regular users - no sensitive contact info
    RETURN QUERY
    SELECT 
      cu.id, cu.name, cu.department, cu.job_position, cu.role, cu.status,
      NULL::text as email, NULL::text as phone_number
    FROM public.comprehensive_users cu
    WHERE cu.status = 'Active'
    ORDER BY cu.name;
  END IF;
END;
$$;

-- 3. Create secure RPC for holiday anomalies (replace the view)
CREATE OR REPLACE FUNCTION public.get_holiday_anomalies_secure()
RETURNS TABLE(
  request_id uuid,
  request_user_id uuid,
  system_user_id uuid,
  system_user_auth_id uuid,
  start_date date,
  end_date date,
  status request_status,
  system_user_name text,
  anomaly_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get current user role
  SELECT p.role::TEXT INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Only Super-Admin can access anomaly data
  IF user_role != 'Super-Admin' THEN
    RAISE EXCEPTION 'Access denied: Only Super-Admin can access holiday anomaly data';
  END IF;
  
  -- Log the access
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), NULL, 'HOLIDAY_ANOMALIES', 'Holiday anomaly analysis access', 0
  );
  
  -- Return anomaly data (this would need to be adapted based on the actual anomaly logic)
  RETURN QUERY
  SELECT 
    hr.id as request_id,
    hr.user_id as request_user_id,
    hr.system_user_id,
    su.user_id as system_user_auth_id,
    hr.start_date,
    hr.end_date,
    hr.status,
    su.name as system_user_name,
    CASE 
      WHEN hr.user_id != su.user_id THEN 'USER_MISMATCH'
      ELSE 'NO_ANOMALY'
    END as anomaly_type
  FROM public.holiday_requests hr
  LEFT JOIN public.system_users su ON hr.system_user_id = su.id
  WHERE hr.user_id != su.user_id OR hr.user_id IS NULL OR su.user_id IS NULL;
END;
$$;

-- 4. Create secure billing dashboard RPC
CREATE OR REPLACE FUNCTION public.get_billing_dashboard_secure()
RETURNS TABLE(
  total_customers bigint,
  total_invoices bigint,
  total_call_logs bigint,
  monthly_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get current user role
  SELECT p.role::TEXT INTO user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.status = 'Active';
  
  -- Only Super-Admin can access billing dashboard
  IF user_role != 'Super-Admin' THEN
    RAISE EXCEPTION 'Access denied: Only Super-Admin can access billing dashboard';
  END IF;
  
  -- Log the access
  INSERT INTO public.staff_data_access_audit (
    accessed_by, employee_user_id, data_type, access_reason, risk_score
  ) VALUES (
    auth.uid(), NULL, 'BILLING_DASHBOARD', 'Billing dashboard access', 0
  );
  
  -- Return aggregated billing data
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.billing_customers WHERE active = true)::bigint as total_customers,
    (SELECT COUNT(*) FROM public.billing_invoices)::bigint as total_invoices,
    (SELECT COUNT(*) FROM public.call_logs)::bigint as total_call_logs,
    (SELECT COALESCE(SUM(total_with_vat), 0) FROM public.billing_invoices 
     WHERE created_on >= date_trunc('month', CURRENT_DATE))::numeric as monthly_revenue;
END;
$$;

-- 5. Restrict comprehensive_users view access
-- Block direct access and force usage of secure RPCs
DROP POLICY IF EXISTS "Users can view basic profile data (masked sensitive fields)" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Admins can view all comprehensive user data" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Admin and Super-Admin can insert comprehensive users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Admin and Super-Admin can update comprehensive users" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Admin and Super-Admin can delete comprehensive users" ON public.comprehensive_users;

-- Create highly restrictive policies that force RPC usage
CREATE POLICY "Block_direct_comprehensive_users_access" 
ON public.comprehensive_users 
FOR ALL 
USING (false)
WITH CHECK (false);

-- Allow emergency access for Super-Admin only (for system maintenance)
CREATE POLICY "Super_Admin_emergency_comprehensive_users_access" 
ON public.comprehensive_users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin' 
    AND status = 'Active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin' 
    AND status = 'Active'
  )
);