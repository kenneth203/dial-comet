-- Security Fixes Migration (Corrected)
-- Fix critical RLS gaps and linter issues

-- 1. CRITICAL: Enable RLS on holiday_data_anomalies (contains PII)
ALTER TABLE public.holiday_data_anomalies ENABLE ROW LEVEL SECURITY;

-- Add restrictive policies for holiday_data_anomalies
CREATE POLICY "Super_Admin_only_holiday_anomalies_access" 
ON public.holiday_data_anomalies 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'::user_role
  )
);

-- Block all modifications to anomaly data (read-only for analysis)
CREATE POLICY "No_direct_holiday_anomalies_insert" 
ON public.holiday_data_anomalies 
FOR INSERT 
WITH CHECK (false);

CREATE POLICY "No_direct_holiday_anomalies_update" 
ON public.holiday_data_anomalies 
FOR UPDATE 
USING (false);

CREATE POLICY "No_direct_holiday_anomalies_delete" 
ON public.holiday_data_anomalies 
FOR DELETE 
USING (false);

-- 2. Fix shift_templates public access (currently publicly readable)
-- First check if shift_templates table exists and add proper RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_templates' AND table_schema = 'public') THEN
    -- Enable RLS if not already enabled
    ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing permissive policies if they exist
    DROP POLICY IF EXISTS "Anyone can view shift templates" ON public.shift_templates;
    DROP POLICY IF EXISTS "Public can view shift templates" ON public.shift_templates;
    
    -- Add secure policies requiring authentication
    CREATE POLICY "Authenticated_users_can_view_shift_templates" 
    ON public.shift_templates 
    FOR SELECT 
    USING (auth.uid() IS NOT NULL);
    
    CREATE POLICY "Admins_can_manage_shift_templates" 
    ON public.shift_templates 
    FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'Admin', 'Supervisor')::user_role[]
      )
    );
  END IF;
END $$;

-- 3. Fix mutable search_path functions
-- Update mask functions to have immutable search_path
DO $$
BEGIN
  -- Add SET search_path to masking functions
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mask_email') THEN
    ALTER FUNCTION public.mask_email(text) SET search_path TO public;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mask_phone_number') THEN
    ALTER FUNCTION public.mask_phone_number(text) SET search_path TO public;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mask_address') THEN
    ALTER FUNCTION public.mask_address(text) SET search_path TO public;
  END IF;
END $$;

-- 4. Financial data security hardening
-- Add enhanced audit function for financial data
CREATE OR REPLACE FUNCTION public.audit_financial_data_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Log any access to financial data for security monitoring
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      ip_address
    ) VALUES (
      auth.uid(),
      NEW.user_id::text,
      TG_OP || '_FINANCIAL_DATA_SECURITY_CHECK',
      NULL
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action,
      ip_address
    ) VALUES (
      auth.uid(),
      OLD.user_id::text,
      TG_OP || '_FINANCIAL_DATA_SECURITY_CHECK',
      NULL
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Add security monitoring trigger (fixed syntax)
DROP TRIGGER IF EXISTS financial_data_security_monitor ON public.employee_financial_data;
CREATE TRIGGER financial_data_security_monitor
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_financial_data
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_financial_data_security();

-- 5. Enhanced billing audit function
CREATE OR REPLACE FUNCTION public.enhanced_billing_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  user_role TEXT;
  record_customer_id UUID;
BEGIN
  -- Get user role for enhanced logging
  SELECT role::TEXT INTO user_role
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Get customer_id from the appropriate record
  IF TG_OP = 'DELETE' THEN
    record_customer_id := OLD.customer_id;
  ELSE
    record_customer_id := NEW.customer_id;
  END IF;
  
  -- Enhanced audit logging
  INSERT INTO public.billing_data_audit (
    accessed_by,
    customer_id,
    action,
    table_name,
    user_agent
  ) VALUES (
    auth.uid(),
    record_customer_id,
    TG_OP || '_ENHANCED_AUDIT',
    TG_TABLE_NAME,
    'Enhanced security audit - Role: ' || COALESCE(user_role, 'unknown')
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 6. Add enhanced security function to check for suspicious financial access patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_financial_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  access_count INTEGER;
  user_role TEXT;
  current_hour INTEGER;
BEGIN
  -- Get current hour and user role
  current_hour := EXTRACT(HOUR FROM NOW());
  
  SELECT role::TEXT INTO user_role
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Count recent accesses by this user
  SELECT COUNT(*) INTO access_count
  FROM public.financial_data_audit_enhanced
  WHERE accessed_by = auth.uid()
  AND access_time > NOW() - INTERVAL '1 hour';
  
  -- Flag suspicious patterns
  IF access_count > 10 OR (current_hour < 6 OR current_hour > 22) THEN
    -- Log as high-risk access
    INSERT INTO public.financial_data_audit_enhanced (
      accessed_by, 
      employee_user_id, 
      access_type, 
      access_reason,
      risk_score,
      suspicious_flags
    ) VALUES (
      auth.uid(),
      CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END,
      'SUSPICIOUS_PATTERN_DETECTED',
      'Automated security check flagged unusual access pattern',
      CASE 
        WHEN access_count > 10 THEN 30
        WHEN current_hour < 6 OR current_hour > 22 THEN 20
        ELSE 10
      END,
      ARRAY['HIGH_FREQUENCY_ACCESS', 'OUT_OF_HOURS_ACCESS']
    );
  END IF;
  
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Apply suspicious access monitoring to financial data
DROP TRIGGER IF EXISTS check_suspicious_financial_access ON public.employee_financial_data;
CREATE TRIGGER check_suspicious_financial_access
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_financial_data
  FOR EACH ROW
  EXECUTE FUNCTION public.check_suspicious_financial_access();