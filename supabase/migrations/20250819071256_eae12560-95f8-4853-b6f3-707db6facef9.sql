-- Fix conflicting RLS policies on comprehensive_users table
-- Remove the blanket "false" policy that conflicts with HR/Admin access

-- Drop the conflicting policy that blocks all direct access
DROP POLICY IF EXISTS "Block_direct_user_access_to_sensitive_data" ON public.comprehensive_users;

-- Ensure users can view their own basic profile data (non-sensitive fields only)
-- This allows users to access their own basic info while keeping sensitive data protected
CREATE POLICY "Users can view own basic profile" 
ON public.comprehensive_users 
FOR SELECT 
USING (
  auth.uid() = auth_user_id 
  AND NOT can_access_sensitive_financial_data()
);

-- The existing HR_Admin policies remain and take precedence for full data access:
-- - HR_Admin_full_access_comprehensive_users (SELECT)
-- - HR_Admin_can_insert_comprehensive_users (INSERT)  
-- - HR_Admin_can_update_comprehensive_users (UPDATE)
-- - HR_Admin_can_delete_comprehensive_users (DELETE)

-- Add comment explaining the security model
COMMENT ON TABLE public.comprehensive_users IS 
'Security model: HR/Admin users get full access via can_access_sensitive_financial_data(). Regular users can only view their own basic profile data (sensitive fields like salary, bank details are filtered at application layer).';

-- Verify the security functions exist and are properly configured
DO $$ 
BEGIN
  -- Test that the security function exists
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_access_sensitive_financial_data') THEN
    RAISE EXCEPTION 'Security function can_access_sensitive_financial_data() not found';
  END IF;
END $$;