-- Fix overly restrictive holiday_requests RLS policies (handling existing policies)
-- Allow users to view and manage their own holiday requests while keeping admin oversight

-- First, let's see what policies currently exist and remove problematic ones
DO $$
DECLARE
    policy_exists BOOLEAN;
BEGIN
    -- Drop restrictive "deny all" policies if they exist
    SELECT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Deny direct user access to holiday_requests'
    ) INTO policy_exists;
    
    IF policy_exists THEN
        DROP POLICY "Deny direct user access to holiday_requests" ON public.holiday_requests;
        RAISE NOTICE 'Dropped restrictive SELECT policy';
    END IF;

    -- Check and drop other restrictive policies
    SELECT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Deny direct insert to holiday_requests'
    ) INTO policy_exists;
    
    IF policy_exists THEN
        DROP POLICY "Deny direct insert to holiday_requests" ON public.holiday_requests;
        RAISE NOTICE 'Dropped restrictive INSERT policy';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Deny direct update to holiday_requests'
    ) INTO policy_exists;
    
    IF policy_exists THEN
        DROP POLICY "Deny direct update to holiday_requests" ON public.holiday_requests;
        RAISE NOTICE 'Dropped restrictive UPDATE policy';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Deny direct delete from holiday_requests'
    ) INTO policy_exists;
    
    IF policy_exists THEN
        DROP POLICY "Deny direct delete from holiday_requests" ON public.holiday_requests;
        RAISE NOTICE 'Dropped restrictive DELETE policy';
    END IF;
END $$;

-- Create user-friendly policies (only if they don't already exist)

-- Users can view their own holiday requests
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Users can view own holiday requests'
    ) THEN
        CREATE POLICY "Users can view own holiday requests" 
        ON public.holiday_requests 
        FOR SELECT 
        USING (auth.uid() = user_id);
        RAISE NOTICE 'Created user SELECT policy';
    END IF;
END $$;

-- Users can create their own holiday requests  
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Users can create own holiday requests'
    ) THEN
        CREATE POLICY "Users can create own holiday requests" 
        ON public.holiday_requests 
        FOR INSERT 
        WITH CHECK (auth.uid() = user_id AND status = 'pending');
        RAISE NOTICE 'Created user INSERT policy';
    END IF;
END $$;

-- Users can update their own PENDING holiday requests only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Users can update own pending requests'
    ) THEN
        CREATE POLICY "Users can update own pending requests" 
        ON public.holiday_requests 
        FOR UPDATE 
        USING (
            auth.uid() = user_id 
            AND status = 'pending'
            AND start_date >= CURRENT_DATE
        )
        WITH CHECK (
            auth.uid() = user_id 
            AND status = 'pending'
        );
        RAISE NOTICE 'Created user UPDATE policy';
    END IF;
END $$;

-- Users can delete their own PENDING holiday requests only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'holiday_requests' 
        AND policyname = 'Users can delete own pending requests'
    ) THEN
        CREATE POLICY "Users can delete own pending requests" 
        ON public.holiday_requests 
        FOR DELETE 
        USING (
            auth.uid() = user_id 
            AND status = 'pending'
            AND start_date >= CURRENT_DATE
        );
        RAISE NOTICE 'Created user DELETE policy';
    END IF;
END $$;

-- Update table comment
COMMENT ON TABLE public.holiday_requests IS 
'Holiday requests with user-friendly RLS policies. Users can view/modify their own pending requests. Admins have full access. Use create_holiday_request() function for enhanced validation and business logic.';

-- Verify the final policy state
DO $$
DECLARE
    user_policies INTEGER;
    admin_policies INTEGER;
    restrictive_policies INTEGER;
BEGIN
    -- Count user-friendly policies
    SELECT COUNT(*) INTO user_policies
    FROM pg_policies 
    WHERE schemaname = 'public'
    AND tablename = 'holiday_requests' 
    AND (policyname LIKE '%Users can%' OR policyname LIKE '%own%');
    
    -- Count admin policies
    SELECT COUNT(*) INTO admin_policies
    FROM pg_policies 
    WHERE schemaname = 'public'
    AND tablename = 'holiday_requests' 
    AND policyname LIKE '%Admin%';
    
    -- Count restrictive "deny" policies (should be 0)
    SELECT COUNT(*) INTO restrictive_policies
    FROM pg_policies 
    WHERE schemaname = 'public'
    AND tablename = 'holiday_requests' 
    AND policyname LIKE '%Deny%';
    
    RAISE NOTICE 'Holiday requests policy summary: % user policies, % admin policies, % restrictive policies', 
                  user_policies, admin_policies, restrictive_policies;
    
    IF restrictive_policies = 0 AND user_policies >= 4 THEN
        RAISE NOTICE 'SUCCESS: Holiday request access fixed! Users can now access their own data.';
    ELSE
        RAISE WARNING 'Policy fix may be incomplete. Check policy configuration.';
    END IF;
END $$;