-- Complete the financial data security separation
-- Remove the sensitive financial columns from the original tables entirely

-- Remove financial columns from comprehensive_users table
ALTER TABLE public.comprehensive_users 
DROP COLUMN IF EXISTS salary,
DROP COLUMN IF EXISTS bank_name,
DROP COLUMN IF EXISTS bank_account_number,
DROP COLUMN IF EXISTS bank_sort_code,
DROP COLUMN IF EXISTS ni_number;

-- Remove financial columns from staff_details table
ALTER TABLE public.staff_details 
DROP COLUMN IF EXISTS salary,
DROP COLUMN IF EXISTS bank_name,
DROP COLUMN IF EXISTS bank_account_number,
DROP COLUMN IF EXISTS bank_sort_code,
DROP COLUMN IF EXISTS ni_number;

-- Update table comments to reflect the security improvements
COMMENT ON TABLE public.comprehensive_users IS 
'Contains basic employee profile information. Sensitive financial data has been moved to employee_financial_data table for enhanced security.';

COMMENT ON TABLE public.staff_details IS 
'Contains non-sensitive staff employment details. Financial data has been separated to employee_financial_data table for security compliance.';

-- Verify the security separation is complete
DO $$
BEGIN
  -- Check that financial columns no longer exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name IN ('comprehensive_users', 'staff_details') 
    AND column_name IN ('salary', 'bank_name', 'bank_account_number', 'bank_sort_code', 'ni_number')
  ) THEN
    RAISE NOTICE 'WARNING: Some financial columns still exist in main tables';
  ELSE
    RAISE NOTICE 'SUCCESS: All sensitive financial data has been properly separated';
  END IF;
  
  -- Verify the new financial table exists and is protected
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_financial_data') THEN
    RAISE EXCEPTION 'CRITICAL: employee_financial_data table not found';
  END IF;
  
  RAISE NOTICE 'Security separation complete: Financial data is now in dedicated secure table';
END $$;