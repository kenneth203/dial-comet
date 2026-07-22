
ALTER TABLE public.staff_data_access_audit DROP CONSTRAINT staff_data_access_audit_data_type_check;

ALTER TABLE public.staff_data_access_audit ADD CONSTRAINT staff_data_access_audit_data_type_check
CHECK (data_type = ANY (ARRAY[
  'FULL_STAFF_ACCESS'::text, 'BASIC_STAFF_INFO'::text, 'CONTACT_INFO'::text,
  'PERSONAL_DETAILS'::text, 'EMERGENCY_CONTACTS'::text, 'STAFF_DIRECTORY_ACCESS'::text,
  'INDIVIDUAL_STAFF_ACCESS'::text, 'STAFF_ONLY_RECORD_CREATION'::text,
  'basic_staff_info'::text, 'contact_info'::text, 'personal_details'::text,
  'emergency_contacts'::text, 'staff_directory'::text, 'bulk_access'::text,
  'directory_access'::text, 'DATABASE_RESET'::text
]));
