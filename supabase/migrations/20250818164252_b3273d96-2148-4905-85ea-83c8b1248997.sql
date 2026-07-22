-- Update staff_details table to include system user fields
ALTER TABLE public.staff_details 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS role text DEFAULT 'Operator',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active',
ADD COLUMN IF NOT EXISTS is_system_user boolean DEFAULT false;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_staff_details_email ON public.staff_details(email);
CREATE INDEX IF NOT EXISTS idx_staff_details_user_id ON public.staff_details(user_id);

-- Update RLS policies for staff_details to allow admin operations
CREATE POLICY IF NOT EXISTS "Admins can insert staff details" 
ON public.staff_details 
FOR INSERT 
WITH CHECK (is_admin_or_higher());

-- Create function to create staff member with optional system user
CREATE OR REPLACE FUNCTION public.create_staff_member_with_user(
  staff_data jsonb,
  create_system_user boolean DEFAULT false,
  user_password text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_user_id uuid;
  staff_id uuid;
BEGIN
  -- Create auth user if requested
  IF create_system_user AND user_password IS NOT NULL THEN
    -- This would need to be handled by the application layer
    -- as we can't create auth users directly from SQL
    RAISE EXCEPTION 'User creation must be handled by application layer';
  END IF;
  
  -- For now, we'll create a staff record without auth user
  -- The application will handle user creation separately
  
  -- Insert staff details
  INSERT INTO public.staff_details (
    user_id,
    email,
    phone_number,
    employee_id,
    department,
    position,
    contract_type,
    working_hours_per_week,
    salary,
    date_of_birth,
    start_date,
    annual_leave_entitlement,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relationship,
    address_line1,
    address_line2,
    city,
    postal_code,
    country,
    bank_name,
    bank_account_number,
    bank_sort_code,
    ni_number,
    role,
    status,
    is_system_user
  )
  VALUES (
    COALESCE((staff_data->>'user_id')::uuid, gen_random_uuid()),
    staff_data->>'email',
    staff_data->>'phone_number',
    staff_data->>'employee_id',
    staff_data->>'department',
    staff_data->>'position',
    COALESCE(staff_data->>'contract_type', 'full_time'),
    COALESCE((staff_data->>'working_hours_per_week')::numeric, 37.5),
    (staff_data->>'salary')::numeric,
    (staff_data->>'date_of_birth')::date,
    (staff_data->>'start_date')::date,
    COALESCE((staff_data->>'annual_leave_entitlement')::numeric, 25.0),
    staff_data->>'emergency_contact_name',
    staff_data->>'emergency_contact_phone',
    staff_data->>'emergency_contact_relationship',
    staff_data->>'address_line1',
    staff_data->>'address_line2',
    staff_data->>'city',
    staff_data->>'postal_code',
    COALESCE(staff_data->>'country', 'United Kingdom'),
    staff_data->>'bank_name',
    staff_data->>'bank_account_number',
    staff_data->>'bank_sort_code',
    staff_data->>'ni_number',
    COALESCE(staff_data->>'role', 'Operator'),
    COALESCE(staff_data->>'status', 'Active'),
    create_system_user
  )
  RETURNING id INTO staff_id;
  
  RETURN staff_id;
END;
$$;