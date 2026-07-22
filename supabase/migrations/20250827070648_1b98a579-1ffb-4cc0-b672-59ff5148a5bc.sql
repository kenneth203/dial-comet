-- Create database reset function (Admin only)
-- This function clears all user-generated data while preserving system configuration

-- Function to check if user is Super-Admin only (highest security level)
CREATE OR REPLACE FUNCTION public.is_super_admin_only()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
    AND status = 'Active'
  );
$$;

-- Database reset function - EXTREMELY RESTRICTED ACCESS
CREATE OR REPLACE FUNCTION public.perform_database_reset(
  confirmation_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_user_id uuid;
  reset_count jsonb := '{}';
  table_counts jsonb := '{}';
BEGIN
  -- Only Super-Admin can execute this function
  IF NOT is_super_admin_only() THEN
    RAISE EXCEPTION 'Access denied: Only Super-Admin can perform database reset';
  END IF;
  
  -- Require confirmation code
  IF confirmation_code IS NULL OR confirmation_code != 'RESET_ALL_DATA_CONFIRM' THEN
    RAISE EXCEPTION 'Invalid confirmation code. This is a destructive operation.';
  END IF;
  
  admin_user_id := auth.uid();
  
  -- Log this critical action
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action,
    ip_address
  ) VALUES (
    admin_user_id,
    admin_user_id::text,
    'DATABASE_RESET_INITIATED',
    NULL
  );
  
  -- Count records before deletion for logging
  SELECT jsonb_build_object(
    'customers', (SELECT COUNT(*) FROM customers),
    'news_items', (SELECT COUNT(*) FROM news_items),
    'todos', (SELECT COUNT(*) FROM todos),
    'billing_invoices', (SELECT COUNT(*) FROM billing_invoices),
    'billing_customers', (SELECT COUNT(*) FROM billing_customers),
    'billing_line_items', (SELECT COUNT(*) FROM billing_line_items),
    'billing_periods', (SELECT COUNT(*) FROM billing_periods),
    'call_logs', (SELECT COUNT(*) FROM call_logs),
    'holiday_requests', (SELECT COUNT(*) FROM holiday_requests),
    'holiday_entitlements', (SELECT COUNT(*) FROM holiday_entitlements),
    'user_statuses', (SELECT COUNT(*) FROM user_statuses),
    'status_timing_logs', (SELECT COUNT(*) FROM status_timing_logs),
    'import_batches', (SELECT COUNT(*) FROM import_batches),
    'customer_pricing', (SELECT COUNT(*) FROM customer_pricing)
  ) INTO table_counts;
  
  -- Clear user-generated data (preserve system tables like profiles, staff_details)
  -- Clear in dependency order to avoid foreign key violations
  
  -- Clear billing line items first (dependent on billing_periods and call_logs)
  DELETE FROM public.billing_line_items;
  
  -- Clear call logs
  DELETE FROM public.call_logs;
  
  -- Clear billing data
  DELETE FROM public.billing_invoices;
  DELETE FROM public.billing_periods;
  DELETE FROM public.customer_pricing;
  DELETE FROM public.billing_customers;
  
  -- Clear import batches
  DELETE FROM public.import_batches;
  
  -- Clear customer data
  DELETE FROM public.customers;
  
  -- Clear tasks and todos
  DELETE FROM public.todos;
  
  -- Clear news items
  DELETE FROM public.news_items;
  
  -- Clear holiday data (but not entitlements as those are system config)
  DELETE FROM public.holiday_requests;
  
  -- Clear user status data
  DELETE FROM public.user_statuses;
  DELETE FROM public.status_timing_logs;
  
  -- Reset holiday entitlements to defaults for existing users
  UPDATE public.holiday_entitlements 
  SET 
    annual_leave_days = 25.0,
    sick_leave_days = 10.0,
    personal_days = 5.0,
    carried_over_days = 0.0,
    updated_at = NOW();
  
  -- Log completion
  INSERT INTO public.sensitive_data_audit (
    accessed_by,
    employee_id,
    action,
    ip_address
  ) VALUES (
    admin_user_id,
    admin_user_id::text,
    'DATABASE_RESET_COMPLETED',
    NULL
  );
  
  -- Return summary
  SELECT jsonb_build_object(
    'success', true,
    'reset_by', admin_user_id,
    'reset_at', NOW(),
    'tables_cleared', table_counts,
    'message', 'Database reset completed successfully. All user data has been cleared.'
  ) INTO reset_count;
  
  RETURN reset_count;
END;
$$;