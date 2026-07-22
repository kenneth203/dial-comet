-- Fix critical security issue: Restrict billing data access to authorized personnel only
-- Current issue: Admin role can access ALL customer billing data which is too broad for financial information
-- Solution: Restrict access to HR and Super-Admin roles only, with enhanced audit logging

-- Update the billing access function to be more restrictive
CREATE OR REPLACE FUNCTION public.can_access_customer_billing_data(target_customer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- Only Super-Admin and HR have full access to billing data
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Super-Admin', 'HR')
      AND status = 'Active'  -- Ensure active user status
    )
    OR
    -- Customer can access their own billing data only
    EXISTS (
      SELECT 1 FROM public.customers 
      WHERE id = target_customer_id 
      AND user_id = auth.uid()
    );
$function$;

-- Create enhanced secure billing data access functions with audit logging
CREATE OR REPLACE FUNCTION public.get_customer_billing_data_ultra_secure(target_customer_id uuid, access_reason text)
 RETURNS TABLE(
   customer_id uuid, name text, rate_per_call numeric, rate_per_minute numeric,
   monthly_charge numeric, base_call_allowance integer, rate_sms numeric,
   rate_transfer_landline numeric, rate_transfer_mobile numeric,
   package_name text, active boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
  is_customer_access BOOLEAN := false;
BEGIN
  -- Get current user role
  SELECT role::TEXT INTO user_role
  FROM public.profiles 
  WHERE user_id = auth.uid() AND status = 'Active';
  
  -- Check if this is customer accessing their own data
  SELECT EXISTS(
    SELECT 1 FROM public.customers 
    WHERE id = target_customer_id AND user_id = auth.uid()
  ) INTO is_customer_access;
  
  -- Validate access permissions
  IF NOT (
    user_role IN ('Super-Admin', 'HR') OR is_customer_access
  ) THEN
    -- Log unauthorized access attempt
    INSERT INTO public.billing_data_audit (
      accessed_by, customer_id, action, table_name, user_agent
    ) VALUES (
      auth.uid(), target_customer_id, 'UNAUTHORIZED_ACCESS_ATTEMPT', 
      'billing_customers', 'Financial data access denied'
    );
    
    RAISE EXCEPTION 'Access denied: Insufficient privileges for financial data access';
  END IF;
  
  -- Validate access reason for non-customer access
  IF NOT is_customer_access AND (access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 10) THEN
    RAISE EXCEPTION 'Business justification (min 10 chars) required for financial data access';
  END IF;
  
  -- Log the authorized access
  INSERT INTO public.billing_data_audit (
    accessed_by, customer_id, action, table_name, user_agent
  ) VALUES (
    auth.uid(), target_customer_id, 
    CASE WHEN is_customer_access THEN 'CUSTOMER_SELF_ACCESS' ELSE 'AUTHORIZED_STAFF_ACCESS' END,
    'billing_customers', 
    COALESCE(access_reason, 'Customer self-access')
  );
  
  -- Return billing data based on access level
  RETURN QUERY
  SELECT 
    bc.customer_id, bc.name,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR') THEN bc.rate_per_call
      ELSE NULL -- Hide detailed rates from customers
    END as rate_per_call,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR') THEN bc.rate_per_minute
      ELSE NULL
    END as rate_per_minute,
    bc.monthly_charge, -- Customers can see their monthly charge
    bc.base_call_allowance,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR') THEN bc.rate_sms
      ELSE NULL
    END as rate_sms,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR') THEN bc.rate_transfer_landline
      ELSE NULL
    END as rate_transfer_landline,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR') THEN bc.rate_transfer_mobile
      ELSE NULL
    END as rate_transfer_mobile,
    bc.package_name, bc.active
  FROM public.billing_customers bc
  WHERE bc.customer_id = target_customer_id;
END;
$function$;

-- Create secure invoice access function with enhanced audit logging
CREATE OR REPLACE FUNCTION public.get_customer_invoices_ultra_secure(target_customer_id uuid, access_reason text)
 RETURNS TABLE(
   invoice_id uuid, customer_id uuid, billing_period text, total_with_vat numeric,
   vat_rate numeric, total_invoice numeric, base_charge numeric, extra_charges numeric,
   calls_made integer, total_minutes numeric, created_on timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
  is_customer_access BOOLEAN := false;
BEGIN
  -- Get current user role
  SELECT role::TEXT INTO user_role
  FROM public.profiles 
  WHERE user_id = auth.uid() AND status = 'Active';
  
  -- Check if this is customer accessing their own data
  SELECT EXISTS(
    SELECT 1 FROM public.customers 
    WHERE id = target_customer_id AND user_id = auth.uid()
  ) INTO is_customer_access;
  
  -- Validate access permissions
  IF NOT (
    user_role IN ('Super-Admin', 'HR') OR is_customer_access
  ) THEN
    -- Log unauthorized access attempt
    INSERT INTO public.billing_data_audit (
      accessed_by, customer_id, action, table_name, user_agent
    ) VALUES (
      auth.uid(), target_customer_id, 'UNAUTHORIZED_INVOICE_ACCESS_ATTEMPT', 
      'billing_invoices', 'Invoice data access denied'
    );
    
    RAISE EXCEPTION 'Access denied: Insufficient privileges for invoice data access';
  END IF;
  
  -- Validate access reason for staff access
  IF NOT is_customer_access AND (access_reason IS NULL OR LENGTH(TRIM(access_reason)) < 10) THEN
    RAISE EXCEPTION 'Business justification (min 10 chars) required for invoice data access';
  END IF;
  
  -- Log the authorized access
  INSERT INTO public.billing_data_audit (
    accessed_by, customer_id, action, table_name, user_agent
  ) VALUES (
    auth.uid(), target_customer_id,
    CASE WHEN is_customer_access THEN 'CUSTOMER_INVOICE_SELF_ACCESS' ELSE 'AUTHORIZED_INVOICE_ACCESS' END,
    'billing_invoices',
    COALESCE(access_reason, 'Customer self-access')
  );
  
  -- Return invoice data
  RETURN QUERY
  SELECT 
    bi.invoice_id, bi.customer_id, bi.billing_period, bi.total_with_vat,
    bi.vat_rate, bi.total_invoice, bi.base_charge, bi.extra_charges,
    bi.calls_made, bi.total_minutes, bi.created_on
  FROM public.billing_invoices bi
  WHERE bi.customer_id = target_customer_id
  ORDER BY bi.created_on DESC;
END;
$function$;

-- Function to validate if user has billing access privileges
CREATE OR REPLACE FUNCTION public.has_billing_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
    AND status = 'Active'
  );
$function$;

-- Add billing-specific audit trigger
CREATE OR REPLACE FUNCTION public.audit_billing_table_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
  table_accessed TEXT;
BEGIN
  -- Get current user role and table name
  SELECT role::TEXT INTO user_role
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  table_accessed := TG_TABLE_NAME;
  
  -- Log all operations on billing tables (except for system operations)
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.billing_data_audit (
      accessed_by,
      customer_id,
      action,
      table_name,
      user_agent
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.customer_id, OLD.customer_id),
      TG_OP || '_' || table_accessed,
      table_accessed,
      'Table operation by ' || COALESCE(user_role, 'unknown_role')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Apply audit trigger to billing tables (if not already exists)
DROP TRIGGER IF EXISTS audit_billing_customers_access ON public.billing_customers;
CREATE TRIGGER audit_billing_customers_access
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_billing_table_access();

DROP TRIGGER IF EXISTS audit_billing_invoices_access ON public.billing_invoices;
CREATE TRIGGER audit_billing_invoices_access
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_billing_table_access();

-- Add comprehensive security comments
COMMENT ON FUNCTION public.can_access_customer_billing_data(uuid) IS 'Restricted billing data access: Only HR, Super-Admin, and customers can access billing information. Removed Admin access for enhanced financial security.';
COMMENT ON FUNCTION public.get_customer_billing_data_ultra_secure(uuid, text) IS 'Ultra-secure billing data access with mandatory access logging and justification requirements.';
COMMENT ON FUNCTION public.get_customer_invoices_ultra_secure(uuid, text) IS 'Ultra-secure invoice data access with comprehensive audit trail and role-based filtering.';
COMMENT ON FUNCTION public.has_billing_access() IS 'Quick check for billing system access privileges - HR and Super-Admin only.';