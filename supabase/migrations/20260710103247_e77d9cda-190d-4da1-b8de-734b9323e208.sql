CREATE OR REPLACE FUNCTION public.get_my_basic_staff_info()
RETURNS TABLE(
  id uuid, user_id uuid, employee_id text, department text, staff_position text,
  contract_type text, working_hours_per_week numeric, country text,
  phone_number text, emergency_contact_name text, emergency_contact_phone text,
  emergency_contact_relationship text, city text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT sd.id, sd.user_id, sd.employee_id, sd.department, sd.position,
         COALESCE(sd.contract_type, 'full_time'), COALESCE(sd.working_hours_per_week, 37.5),
         COALESCE(sd.country, 'United Kingdom'), sd.phone_number,
         esd.emergency_contact_name, esd.emergency_contact_phone, esd.emergency_contact_relationship,
         sd.city, sd.created_at, sd.updated_at
  FROM public.staff_details sd
  LEFT JOIN public.employee_sensitive_data esd ON esd.user_id = sd.user_id
  WHERE sd.user_id = auth.uid();
$$;