-- CRITICAL SECURITY FIX: Separate sensitive financial data into ultra-secure table
-- This addresses the "Employee Financial Data Could Be Stolen by Hackers" vulnerability

-- Create dedicated table for ultra-sensitive financial data
CREATE TABLE public.employee_financial_data (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE, -- Link to comprehensive_users
    
    -- Financial information (ultra-sensitive)
    salary numeric,
    bank_name text,
    bank_account_number text,
    bank_sort_code text,
    ni_number text, -- National Insurance number
    
    -- Audit fields
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    last_accessed_by uuid,
    last_accessed_at timestamp with time zone
);

-- Enable RLS on the financial data table
ALTER TABLE public.employee_financial_data ENABLE ROW LEVEL SECURITY;

-- ULTRA-RESTRICTIVE RLS POLICIES - Only Super-Admin and HR can access
CREATE POLICY "Ultra_restricted_financial_data_access" 
ON public.employee_financial_data 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'HR')
    )
);

-- Create audit trigger for financial data modifications (INSERT, UPDATE, DELETE only)
CREATE OR REPLACE FUNCTION public.audit_financial_data_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Log any modification to financial data
    INSERT INTO public.sensitive_data_audit (
        accessed_by,
        employee_id,
        action
    ) VALUES (
        auth.uid(),
        COALESCE(NEW.user_id::text, OLD.user_id::text),
        TG_OP || '_FINANCIAL_DATA'
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger for modifications only
CREATE TRIGGER audit_financial_modifications
    AFTER INSERT OR UPDATE OR DELETE ON public.employee_financial_data
    FOR EACH ROW EXECUTE FUNCTION audit_financial_data_access();

-- Migrate existing financial data from comprehensive_users
INSERT INTO public.employee_financial_data (
    user_id, salary, bank_name, bank_account_number, bank_sort_code, ni_number
)
SELECT 
    id as user_id,
    salary,
    bank_name, 
    bank_account_number,
    bank_sort_code,
    ni_number
FROM public.comprehensive_users 
WHERE salary IS NOT NULL 
   OR bank_name IS NOT NULL 
   OR bank_account_number IS NOT NULL 
   OR bank_sort_code IS NOT NULL
   OR ni_number IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Migrate existing financial data from staff_details
INSERT INTO public.employee_financial_data (
    user_id, salary, bank_name, bank_account_number, bank_sort_code, ni_number
)
SELECT 
    user_id,
    salary,
    bank_name,
    bank_account_number, 
    bank_sort_code,
    ni_number
FROM public.staff_details 
WHERE user_id IS NOT NULL 
  AND (salary IS NOT NULL 
       OR bank_name IS NOT NULL 
       OR bank_account_number IS NOT NULL 
       OR bank_sort_code IS NOT NULL
       OR ni_number IS NOT NULL)
ON CONFLICT (user_id) DO UPDATE SET
    salary = COALESCE(EXCLUDED.salary, employee_financial_data.salary),
    bank_name = COALESCE(EXCLUDED.bank_name, employee_financial_data.bank_name),
    bank_account_number = COALESCE(EXCLUDED.bank_account_number, employee_financial_data.bank_account_number),
    bank_sort_code = COALESCE(EXCLUDED.bank_sort_code, employee_financial_data.bank_sort_code),
    ni_number = COALESCE(EXCLUDED.ni_number, employee_financial_data.ni_number);

-- Remove financial columns from comprehensive_users (keeping them NULL for backward compatibility)
UPDATE public.comprehensive_users SET 
    salary = NULL,
    bank_name = NULL,
    bank_account_number = NULL, 
    bank_sort_code = NULL,
    ni_number = NULL;

-- Remove financial columns from staff_details 
UPDATE public.staff_details SET
    salary = NULL,
    bank_name = NULL,
    bank_account_number = NULL,
    bank_sort_code = NULL, 
    ni_number = NULL;

-- Create secure function to get financial data (HR/Super-Admin only) with access logging
CREATE OR REPLACE FUNCTION public.get_employee_financial_data(employee_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
    user_id uuid,
    salary numeric,
    bank_name text,
    bank_account_number text,
    bank_sort_code text,
    ni_number text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
) 
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    -- Only HR and Super-Admin can access financial data
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'HR')
    ) THEN
        RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can access financial data';
    END IF;
    
    -- Log the access
    INSERT INTO public.sensitive_data_audit (
        accessed_by,
        employee_id,
        action
    ) VALUES (
        auth.uid(),
        employee_user_id::text,
        'VIEW_FINANCIAL_DATA'
    );
    
    -- Update last access tracking
    UPDATE public.employee_financial_data 
    SET 
        last_accessed_by = auth.uid(),
        last_accessed_at = NOW()
    WHERE employee_financial_data.user_id = employee_user_id;
    
    -- Return the data
    RETURN QUERY
    SELECT 
        efd.user_id,
        efd.salary,
        efd.bank_name,
        efd.bank_account_number,
        efd.bank_sort_code,
        efd.ni_number,
        efd.created_at,
        efd.updated_at
    FROM public.employee_financial_data efd
    WHERE efd.user_id = employee_user_id;
END;
$$;

-- Create secure function to update financial data (HR/Super-Admin only)
CREATE OR REPLACE FUNCTION public.update_employee_financial_data(
    employee_user_id uuid,
    new_salary numeric DEFAULT NULL,
    new_bank_name text DEFAULT NULL,
    new_bank_account_number text DEFAULT NULL,
    new_bank_sort_code text DEFAULT NULL,
    new_ni_number text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only HR and Super-Admin can update financial data
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE user_id = auth.uid() 
        AND role IN ('Super-Admin', 'HR')
    ) THEN
        RAISE EXCEPTION 'Access denied: Only HR and Super-Admin can modify financial data';
    END IF;

    -- Insert or update financial data
    INSERT INTO public.employee_financial_data (
        user_id, salary, bank_name, bank_account_number, bank_sort_code, ni_number
    ) VALUES (
        employee_user_id, new_salary, new_bank_name, new_bank_account_number, new_bank_sort_code, new_ni_number
    )
    ON CONFLICT (user_id) DO UPDATE SET
        salary = COALESCE(new_salary, employee_financial_data.salary),
        bank_name = COALESCE(new_bank_name, employee_financial_data.bank_name),
        bank_account_number = COALESCE(new_bank_account_number, employee_financial_data.bank_account_number),
        bank_sort_code = COALESCE(new_bank_sort_code, employee_financial_data.bank_sort_code),
        ni_number = COALESCE(new_ni_number, employee_financial_data.ni_number),
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- Add table comments for security documentation
COMMENT ON TABLE public.employee_financial_data IS 
'ULTRA-SENSITIVE: Contains employee financial data including salaries, bank details, and National Insurance numbers. Access restricted to HR and Super-Admin roles only. All access is audited.';

-- Add column comments
COMMENT ON COLUMN public.employee_financial_data.salary IS 'Employee salary - CONFIDENTIAL';
COMMENT ON COLUMN public.employee_financial_data.bank_account_number IS 'Bank account number - HIGHLY SENSITIVE';
COMMENT ON COLUMN public.employee_financial_data.bank_sort_code IS 'Bank sort code - HIGHLY SENSITIVE';  
COMMENT ON COLUMN public.employee_financial_data.ni_number IS 'National Insurance number - HIGHLY SENSITIVE';

-- Grant minimal permissions
REVOKE ALL ON public.employee_financial_data FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO authenticated;