-- Analyze and fix staff_details table security vulnerabilities

-- First, check what policies currently exist on staff_details
-- and ensure they're properly secured

-- Drop any potentially weak policies on staff_details
DROP POLICY IF EXISTS "Users can update basic staff info only" ON staff_details;
DROP POLICY IF EXISTS "Secure staff data access policy" ON staff_details;

-- Test the is_admin_or_higher function to ensure it works correctly
-- Create a more robust admin check function specifically for staff_details
CREATE OR REPLACE FUNCTION public.can_access_staff_details()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('HR', 'Admin', 'Super-Admin')
  );
$$;

-- Create secure RLS policies for staff_details table

-- 1. Only HR/Admin can view staff details (including sensitive data)
CREATE POLICY "HR_Admin_only_view_staff_details"
ON staff_details
FOR SELECT
TO authenticated
USING (can_access_staff_details());

-- 2. Only HR/Admin can insert staff details
CREATE POLICY "HR_Admin_only_insert_staff_details" 
ON staff_details
FOR INSERT
TO authenticated
WITH CHECK (can_access_staff_details());

-- 3. Only HR/Admin can update staff details
CREATE POLICY "HR_Admin_only_update_staff_details"
ON staff_details
FOR UPDATE
TO authenticated
USING (can_access_staff_details())
WITH CHECK (can_access_staff_details());

-- 4. Only HR/Admin can delete staff details
CREATE POLICY "HR_Admin_only_delete_staff_details"
ON staff_details
FOR DELETE
TO authenticated
USING (can_access_staff_details());

-- 5. Block all other access - no regular user access allowed
CREATE POLICY "Block_regular_user_access_staff_details"
ON staff_details
FOR ALL
TO authenticated
USING (false);

-- Create a secure function for users to update only their basic contact info
-- (if staff_details is still used for user profile updates)
CREATE OR REPLACE FUNCTION public.update_my_staff_basic_info(
  new_phone_number text DEFAULT NULL,
  new_emergency_contact_name text DEFAULT NULL,
  new_emergency_contact_phone text DEFAULT NULL,
  new_emergency_contact_relationship text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify user has a staff record
  IF NOT EXISTS(SELECT 1 FROM staff_details WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'No staff record found for current user';
  END IF;
  
  -- Update only safe, non-sensitive fields
  UPDATE public.staff_details 
  SET 
    phone_number = COALESCE(new_phone_number, phone_number),
    emergency_contact_name = COALESCE(new_emergency_contact_name, emergency_contact_name),
    emergency_contact_phone = COALESCE(new_emergency_contact_phone, emergency_contact_phone),
    emergency_contact_relationship = COALESCE(new_emergency_contact_relationship, emergency_contact_relationship),
    updated_at = NOW()
  WHERE user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;

-- Create a secure function for users to view only their basic (non-sensitive) staff info
CREATE OR REPLACE FUNCTION public.get_my_basic_staff_info()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  employee_id text,
  email text,
  phone_number text,
  department text,
  position text,
  contract_type text,
  working_hours_per_week numeric,
  start_date date,
  annual_leave_entitlement numeric,
  role text,
  status text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  city text,
  country text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    s.id,
    s.user_id,
    s.employee_id,
    s.email,
    s.phone_number,
    s.department,
    s.position,
    s.contract_type,
    s.working_hours_per_week,
    s.start_date,
    s.annual_leave_entitlement,
    s.role,
    s.status,
    s.emergency_contact_name,
    s.emergency_contact_phone,
    s.emergency_contact_relationship,
    s.city,
    s.country,
    s.created_at,
    s.updated_at
  FROM public.staff_details s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;

-- Add additional security: Create audit trigger for staff_details access
CREATE OR REPLACE FUNCTION public.audit_staff_details_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log any access to sensitive staff data
  IF TG_OP = 'SELECT' AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.sensitive_data_audit (
      accessed_by,
      employee_id,
      action
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.employee_id, OLD.employee_id, 'unknown'),
      'view_staff_details'
    );
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Note: We cannot create SELECT triggers in PostgreSQL, so we'll rely on application-level logging