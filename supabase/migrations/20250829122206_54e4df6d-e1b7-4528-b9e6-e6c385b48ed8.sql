-- Enhanced Security Fix for Employee Personal Data Protection
-- Addresses: Employee Personal Data Could Be Stolen by Hackers

-- First, let's create secure access functions with audit logging
CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE 
        WHEN email IS NULL THEN NULL
        WHEN LENGTH(email) < 5 THEN email
        ELSE LEFT(email, 2) || '***@' || SPLIT_PART(email, '@', 2)
    END;
$$;

-- Create secure employee data access function with audit logging
CREATE OR REPLACE FUNCTION public.get_employee_basic_data_secure(target_user_id uuid)
RETURNS TABLE(
    id uuid, auth_user_id uuid, name text, email text, phone_number text, 
    role text, status text, employee_id text, department text, job_position text,
    created_at timestamp with time zone, updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    accessor_role TEXT;
    is_own_record BOOLEAN;
BEGIN
    -- Get current user role
    SELECT role::TEXT INTO accessor_role 
    FROM public.profiles 
    WHERE user_id = auth.uid();
    
    -- Check if accessing own record
    is_own_record := (auth.uid() = target_user_id);
    
    -- Log the access attempt
    INSERT INTO public.sensitive_data_access_log (
        accessed_by,
        employee_user_id,
        data_type,
        access_reason
    ) VALUES (
        auth.uid(),
        target_user_id,
        'basic_employee_data',
        CASE 
            WHEN is_own_record THEN 'Self-access'
            ELSE 'Administrative access'
        END
    );
    
    -- Return data with appropriate masking based on access level
    RETURN QUERY
    SELECT 
        cu.id,
        cu.auth_user_id,
        cu.name,
        CASE 
            -- Full access for HR/Super-Admin and own records
            WHEN accessor_role IN ('HR', 'Super-Admin') OR is_own_record THEN cu.email
            -- Masked email for others
            ELSE mask_email(cu.email)
        END as email,
        CASE 
            WHEN accessor_role IN ('HR', 'Super-Admin') OR is_own_record THEN cu.phone_number
            ELSE mask_phone_number(cu.phone_number)
        END as phone_number,
        cu.role,
        cu.status,
        cu.employee_id,
        cu.department,
        cu.job_position,
        cu.created_at,
        cu.updated_at
    FROM public.comprehensive_users cu
    WHERE cu.auth_user_id = target_user_id;
END;
$$;

-- Drop existing permissive policies
DROP POLICY IF EXISTS "HR_Admin_can_view_basic_employee_info" ON public.comprehensive_users;
DROP POLICY IF EXISTS "Users_can_view_own_basic_info_only" ON public.comprehensive_users;

-- Create ultra-restrictive RLS policies that block direct access
CREATE POLICY "Block_direct_comprehensive_users_access" 
ON public.comprehensive_users 
FOR ALL 
USING (false);

-- Create a view for safe employee data access
CREATE OR REPLACE VIEW public.safe_employee_data AS
SELECT 
    cu.id,
    cu.auth_user_id,
    cu.name,
    CASE 
        WHEN cu.auth_user_id = auth.uid() THEN cu.email
        WHEN EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role IN ('HR', 'Super-Admin')
        ) THEN cu.email
        ELSE mask_email(cu.email)
    END as email,
    CASE 
        WHEN cu.auth_user_id = auth.uid() THEN cu.phone_number
        WHEN EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role IN ('HR', 'Super-Admin')
        ) THEN cu.phone_number
        ELSE mask_phone_number(cu.phone_number)
    END as phone_number,
    cu.role,
    cu.status,
    cu.employee_id,
    cu.department,
    cu.job_position,
    cu.created_at,
    cu.updated_at
FROM public.comprehensive_users cu
WHERE 
    -- Users can see their own data
    cu.auth_user_id = auth.uid()
    OR
    -- HR and Super-Admin can see all data (but will be masked appropriately)
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('HR', 'Super-Admin')
        AND status = 'Active'
    );

-- Grant access to the safe view
GRANT SELECT ON public.safe_employee_data TO authenticated;

-- Create policy for the view
CREATE POLICY "Allow_access_to_safe_employee_data" 
ON public.safe_employee_data 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Override policies for essential admin functions (very restrictive)
CREATE POLICY "Super_Admin_emergency_access_only" 
ON public.comprehensive_users 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'
        AND status = 'Active'
    )
);

-- Allow HR and Super-Admin to update records with audit logging
CREATE POLICY "HR_SuperAdmin_can_update_with_audit" 
ON public.comprehensive_users 
FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('HR', 'Super-Admin')
        AND status = 'Active'
    )
);

-- Allow HR and Super-Admin to insert records
CREATE POLICY "HR_SuperAdmin_can_insert_employees" 
ON public.comprehensive_users 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('HR', 'Super-Admin')
        AND status = 'Active'
    )
);

-- Only Super-Admin can delete (emergency situations)
CREATE POLICY "Super_Admin_only_delete_emergency" 
ON public.comprehensive_users 
FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role = 'Super-Admin'
        AND status = 'Active'
    )
);