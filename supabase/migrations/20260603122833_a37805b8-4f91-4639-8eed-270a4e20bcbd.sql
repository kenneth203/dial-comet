-- 1) Drop unused plaintext sensitive columns from comprehensive_users
ALTER TABLE public.comprehensive_users
  DROP COLUMN IF EXISTS ni_number,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_sort_code,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS salary,
  DROP COLUMN IF EXISTS date_of_birth,
  DROP COLUMN IF EXISTS emergency_contact_phone,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2;

-- 2) Drop unused plaintext sensitive columns from employee_financial_data
--    (encrypted_* columns remain as the sole source of truth)
ALTER TABLE public.employee_financial_data
  DROP COLUMN IF EXISTS ni_number,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_sort_code,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS salary;

-- 3) Drop unused plaintext sensitive columns from staff_details
ALTER TABLE public.staff_details
  DROP COLUMN IF EXISTS ni_number,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_sort_code,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS salary,
  DROP COLUMN IF EXISTS date_of_birth,
  DROP COLUMN IF EXISTS emergency_contact_phone,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2;

-- 4) Explicit deny-all policy on auth_failed_attempts so linter sees a policy.
--    Reads/writes still happen exclusively through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "auth_failed_attempts_no_direct_access" ON public.auth_failed_attempts;
CREATE POLICY "auth_failed_attempts_no_direct_access"
  ON public.auth_failed_attempts
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);