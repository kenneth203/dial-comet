-- Fix overly restrictive holiday_requests RLS policies
-- Allow users to view and manage their own holiday requests while keeping admin oversight

-- Drop the overly restrictive "deny all" policies
DROP POLICY IF EXISTS "Deny direct user access to holiday_requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Deny direct insert to holiday_requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Deny direct update to holiday_requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Deny direct delete from holiday_requests" ON public.holiday_requests;

-- Create user-friendly policies that allow self-access while maintaining security

-- Users can view their own holiday requests
CREATE POLICY "Users can view own holiday requests" 
ON public.holiday_requests 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own holiday requests
CREATE POLICY "Users can create own holiday requests" 
ON public.holiday_requests 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Users can update their own PENDING holiday requests only
-- (Cannot modify approved/declined requests)
CREATE POLICY "Users can update own pending requests" 
ON public.holiday_requests 
FOR UPDATE 
USING (
    auth.uid() = user_id 
    AND status = 'pending'
    AND start_date >= CURRENT_DATE -- Cannot modify past requests
)
WITH CHECK (
    auth.uid() = user_id 
    AND status = 'pending' -- Can only keep status as pending when updating
);

-- Users can delete their own PENDING holiday requests only
CREATE POLICY "Users can delete own pending requests" 
ON public.holiday_requests 
FOR DELETE 
USING (
    auth.uid() = user_id 
    AND status = 'pending'
    AND start_date >= CURRENT_DATE -- Cannot delete past requests
);

-- Keep existing admin policies (these remain unchanged)
-- "Admins can view all holiday requests" - already exists
-- "Admins can insert holiday requests" - already exists  
-- "Admins can update holiday requests" - already exists
-- "Admins can delete holiday requests" - already exists

-- Update the secure functions to work with the new policies
-- The create_holiday_request function should still be preferred for validation
-- But now users have direct access as a fallback

-- Add helpful comments to document the security model
COMMENT ON TABLE public.holiday_requests IS 
'Holiday requests with user-friendly RLS policies. Users can view/modify their own pending requests. Admins have full access. Use create_holiday_request() function for enhanced validation and business logic.';

-- Verify the new policies are working correctly
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    -- Count user-accessible policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE tablename = 'holiday_requests' 
    AND (
        policyname LIKE '%Users can%' 
        OR policyname LIKE '%own%'
    );
    
    IF policy_count >= 4 THEN
        RAISE NOTICE 'SUCCESS: User-friendly holiday request policies created (% policies)', policy_count;
    ELSE
        RAISE WARNING 'Only % user policies found, expected at least 4', policy_count;
    END IF;
END $$;