-- Merge Staff Management and Users into unified User Management system (Fixed)
-- This migration consolidates system_users and staff_details into a single comprehensive user system

-- Step 1: Create a new comprehensive users table that combines both systems
CREATE TABLE IF NOT EXISTS public.comprehensive_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Basic Profile Information (from both systems)
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  
  -- Role and Status (from both systems)
  role TEXT NOT NULL DEFAULT 'Operator',
  status TEXT NOT NULL DEFAULT 'Active',
  
  -- Employment Details (from staff_details)
  employee_id TEXT,
  department TEXT,
  job_position TEXT, -- Fixed: renamed from 'position' to avoid reserved word
  contract_type TEXT DEFAULT 'full_time',
  working_hours_per_week NUMERIC DEFAULT 37.5,
  start_date DATE,
  annual_leave_entitlement NUMERIC DEFAULT 25.0,
  
  -- Sensitive Personal Data (from staff_details)
  date_of_birth DATE,
  ni_number TEXT,
  
  -- Address Information (from staff_details)
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'United Kingdom',
  
  -- Emergency Contact (from staff_details)
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  -- Financial Information (from staff_details)
  salary NUMERIC,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_sort_code TEXT,
  
  -- System flags
  is_system_user BOOLEAN DEFAULT false,
  is_staff_member BOOLEAN DEFAULT false,
  
  -- Line management
  line_manager_id UUID,
  
  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on the new table
ALTER TABLE public.comprehensive_users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for the new comprehensive users table
-- Admin policy - full access to all users and all data
CREATE POLICY "Admins can manage all comprehensive user data" 
ON public.comprehensive_users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Admin', 'Super-Admin', 'Supervisor')
  )
);

-- User policy - can only view their own basic profile data
CREATE POLICY "Users can view own basic profile data" 
ON public.comprehensive_users 
FOR SELECT 
USING (auth.uid() = auth_user_id);

-- User policy - can update their own basic contact info only
CREATE POLICY "Users can update own basic contact info" 
ON public.comprehensive_users 
FOR UPDATE 
USING (auth.uid() = auth_user_id)
WITH CHECK (auth.uid() = auth_user_id);

-- Insert trigger for updated_at
CREATE TRIGGER update_comprehensive_users_updated_at
  BEFORE UPDATE ON public.comprehensive_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create secure function for basic user data (for task/todo assignment)
CREATE OR REPLACE FUNCTION public.get_assignable_comprehensive_users()
RETURNS TABLE(
  id UUID,
  name TEXT,
  role TEXT,
  status TEXT,
  department TEXT,
  job_position TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cu.id,
    cu.name,
    cu.role,
    cu.status,
    cu.department,
    cu.job_position
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active'
  ORDER BY cu.name;
$$;