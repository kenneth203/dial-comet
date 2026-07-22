-- Fix all staff data access issues - Part 1: Drop and recreate functions

-- 1. Drop existing functions that need to be recreated
DROP FUNCTION IF EXISTS public.get_staff_basic_info_secure();
DROP FUNCTION IF EXISTS public.get_staff_personal_details_secure(uuid, text);
DROP FUNCTION IF EXISTS public.log_staff_data_access(uuid, text, text, text[]);

-- 2. Update the constraint to allow all data_type values
ALTER TABLE public.staff_data_access_audit 
DROP CONSTRAINT IF EXISTS staff_data_access_audit_data_type_check;

ALTER TABLE public.staff_data_access_audit 
ADD CONSTRAINT staff_data_access_audit_data_type_check 
CHECK (data_type IN (
    'FULL_STAFF_ACCESS',
    'BASIC_STAFF_INFO', 
    'CONTACT_INFO',
    'PERSONAL_DETAILS',
    'EMERGENCY_CONTACTS',
    'STAFF_DIRECTORY_ACCESS',
    'INDIVIDUAL_STAFF_ACCESS',
    'basic_staff_info',
    'contact_info',
    'personal_details',
    'emergency_contacts',
    'staff_directory',
    'bulk_access',
    'directory_access'
));