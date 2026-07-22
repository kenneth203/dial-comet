-- Fix the check constraint issue on staff_data_access_audit table
-- The constraint is rejecting valid data_type values

-- First, let's see what the current constraint is and drop it
DO $$
BEGIN
    -- Drop the problematic check constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'staff_data_access_audit_data_type_check'
    ) THEN
        ALTER TABLE public.staff_data_access_audit 
        DROP CONSTRAINT staff_data_access_audit_data_type_check;
    END IF;
END $$;

-- Add a more flexible check constraint for data_type
ALTER TABLE public.staff_data_access_audit 
ADD CONSTRAINT staff_data_access_audit_data_type_check 
CHECK (data_type IN (
    'FULL_STAFF_ACCESS',
    'BASIC_STAFF_INFO', 
    'CONTACT_INFO',
    'PERSONAL_DETAILS',
    'EMERGENCY_CONTACTS',
    'STAFF_DIRECTORY_ACCESS',
    'INDIVIDUAL_STAFF_ACCESS'
));