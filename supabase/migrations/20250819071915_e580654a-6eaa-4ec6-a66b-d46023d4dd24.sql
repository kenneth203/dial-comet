-- Fix security warnings: Set search_path for SECURITY DEFINER functions
-- Properly handle trigger dependencies

-- Drop the trigger first
DROP TRIGGER IF EXISTS audit_financial_modifications ON public.employee_financial_data;

-- Now drop and recreate the function with proper search_path
DROP FUNCTION IF EXISTS public.audit_financial_data_access();

CREATE OR REPLACE FUNCTION public.audit_financial_data_access()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
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
$$;

-- Recreate the trigger
CREATE TRIGGER audit_financial_modifications
    AFTER INSERT OR UPDATE OR DELETE ON public.employee_financial_data
    FOR EACH ROW EXECUTE FUNCTION audit_financial_data_access();

-- Fix the financial data access functions with proper search_path
DROP FUNCTION IF EXISTS public.get_employee_financial_data(uuid);
DROP FUNCTION IF EXISTS public.update_employee_financial_data(uuid, numeric, text, text, text, text);

-- Recreate with proper search_path security
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
SET search_path = public
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
SET search_path = public
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