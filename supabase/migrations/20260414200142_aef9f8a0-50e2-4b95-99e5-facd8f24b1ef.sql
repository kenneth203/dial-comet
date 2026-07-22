
-- ============================================================
-- 1. PERMISSIONS SYSTEM RPCs
-- ============================================================

-- get_my_permissions: returns the current user's permission grants
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(section text, feature text, granted boolean, scope text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ap.section, ap.feature, COALESCE(apg.granted, false), COALESCE(apg.scope, 'none')
  FROM public.app_permissions ap
  LEFT JOIN public.app_permission_grants apg 
    ON apg.permission_id = ap.id 
    AND apg.role = (SELECT role::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  ORDER BY ap.section, ap.feature;
$$;

-- get_permissions_matrix_secure: returns full matrix for admin UI
CREATE OR REPLACE FUNCTION public.get_permissions_matrix_secure()
RETURNS TABLE(id uuid, section text, feature text, icon text, description text, role text, granted boolean, scope text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT ap.id, ap.section, ap.feature, ap.icon, ap.description,
         apg.role, COALESCE(apg.granted, false), COALESCE(apg.scope, 'none')
  FROM public.app_permissions ap
  CROSS JOIN (SELECT unnest(ARRAY['Super-Admin','Supervisor','Operator']) AS role) roles
  LEFT JOIN public.app_permission_grants apg 
    ON apg.permission_id = ap.id AND apg.role = roles.role
  ORDER BY ap.section, ap.feature, roles.role;
END;
$$;

-- update_permission_grant: upsert a permission grant
CREATE OR REPLACE FUNCTION public.update_permission_grant(
  p_permission_id uuid,
  p_role text,
  p_granted boolean,
  p_scope text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.app_permission_grants (permission_id, role, granted, scope)
  VALUES (p_permission_id, p_role, p_granted, p_scope)
  ON CONFLICT (permission_id, role) 
  DO UPDATE SET granted = p_granted, scope = p_scope, updated_at = now();
END;
$$;

-- Add unique constraint for permission_grants upsert if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_permission_grants_permission_id_role_key'
  ) THEN
    ALTER TABLE public.app_permission_grants ADD CONSTRAINT app_permission_grants_permission_id_role_key UNIQUE (permission_id, role);
  END IF;
END $$;

-- ============================================================
-- 2. USER MANAGEMENT RPCs
-- ============================================================

-- get_all_basic_user_profiles: admin gets all comprehensive_users (non-sensitive)
CREATE OR REPLACE FUNCTION public.get_all_basic_user_profiles()
RETURNS TABLE(
  id uuid, auth_user_id uuid, name text, email text, phone_number text,
  role text, status text, employee_id text, department text, job_position text,
  contract_type text, working_hours_per_week numeric, start_date date,
  annual_leave_entitlement numeric, city text, country text,
  is_system_user boolean, is_staff_member boolean,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT cu.id, cu.auth_user_id, cu.name, cu.email, cu.phone_number,
         cu.role, cu.status, cu.employee_id, cu.department, cu.position,
         cu.contract_type, cu.working_hours_per_week, cu.start_date,
         cu.annual_leave_entitlement, cu.city, cu.country,
         COALESCE(cu.is_system_user, false), COALESCE(cu.is_staff_member, false),
         cu.created_at, cu.updated_at
  FROM public.comprehensive_users cu
  ORDER BY cu.name;
END;
$$;

-- get_basic_user_profile: regular user gets own profile
CREATE OR REPLACE FUNCTION public.get_basic_user_profile()
RETURNS TABLE(
  id uuid, auth_user_id uuid, name text, email text, phone_number text,
  role text, status text, employee_id text, department text, job_position text,
  contract_type text, working_hours_per_week numeric, start_date date,
  annual_leave_entitlement numeric, city text, country text,
  is_system_user boolean, is_staff_member boolean,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cu.id, cu.auth_user_id, cu.name, cu.email, cu.phone_number,
         cu.role, cu.status, cu.employee_id, cu.department, cu.position,
         cu.contract_type, cu.working_hours_per_week, cu.start_date,
         cu.annual_leave_entitlement, cu.city, cu.country,
         COALESCE(cu.is_system_user, false), COALESCE(cu.is_staff_member, false),
         cu.created_at, cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid()
  ORDER BY cu.name;
$$;

-- get_user_display_name: get display name for any user by auth id
CREATE OR REPLACE FUNCTION public.get_user_display_name(target_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT name FROM public.profiles WHERE user_id = target_user_id LIMIT 1;
$$;

-- get_all_system_users_for_management_secure
CREATE OR REPLACE FUNCTION public.get_all_system_users_for_management_secure()
RETURNS TABLE(
  id uuid, user_id uuid, name text, email text, role text, status text,
  department text, job_title text, start_date date,
  date_of_birth text, address_masked text,
  home_phone_masked text, mobile_phone_masked text,
  annual_leave_days numeric, sick_leave_days numeric,
  personal_days numeric, public_holidays numeric,
  christmas_closure_days numeric, carried_over_days numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT su.id, su.user_id, su.name, su.email, su.role, su.status,
         su.department, su.position AS job_title, su.start_date,
         'Protected'::text AS date_of_birth,
         'Protected'::text AS address_masked,
         'Protected'::text AS home_phone_masked,
         COALESCE(su.phone_number, 'Protected') AS mobile_phone_masked,
         COALESCE(he.annual_leave_entitlement, su.annual_leave_entitlement, 25) AS annual_leave_days,
         COALESCE(he.sick_leave_entitlement, 10) AS sick_leave_days,
         COALESCE(he.personal_days_entitlement, 5) AS personal_days,
         10::numeric AS public_holidays,
         5::numeric AS christmas_closure_days,
         COALESCE(he.carried_over, 0) AS carried_over_days
  FROM public.system_users su
  LEFT JOIN public.holiday_entitlements he 
    ON he.user_id = su.id AND he.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
  ORDER BY su.name;
END;
$$;

-- admin_create_system_user
CREATE OR REPLACE FUNCTION public.admin_create_system_user(
  p_user_id uuid, p_name text, p_email text, p_role text, p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.system_users (user_id, name, email, role, status)
  VALUES (p_user_id, p_name, p_email, p_role, p_status)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- admin_update_system_user
CREATE OR REPLACE FUNCTION public.admin_update_system_user(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_position text DEFAULT NULL,
  p_phone_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.system_users SET
    name = COALESCE(p_name, name),
    email = COALESCE(p_email, email),
    role = COALESCE(p_role, role),
    status = COALESCE(p_status, status),
    department = COALESCE(p_department, department),
    position = COALESCE(p_position, position),
    phone_number = COALESCE(p_phone_number, phone_number),
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- admin_delete_system_user
CREATE OR REPLACE FUNCTION public.admin_delete_system_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM public.system_users WHERE id = p_id;
END;
$$;

-- ============================================================
-- 3. HOLIDAY SYSTEM RPCs
-- ============================================================

-- get_my_holiday_requests_strict: returns current user's holiday requests via system_user link
CREATE OR REPLACE FUNCTION public.get_my_holiday_requests_strict()
RETURNS SETOF holiday_requests
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_system_user_id uuid;
BEGIN
  SELECT id INTO v_system_user_id FROM public.system_users WHERE user_id = auth.uid() LIMIT 1;

  RETURN QUERY
  SELECT hr.* FROM public.holiday_requests hr
  WHERE hr.user_id = auth.uid()
     OR hr.system_user_id = v_system_user_id
  ORDER BY hr.created_at DESC;
END;
$$;

-- get_system_user_holiday_breakdown
CREATE OR REPLACE FUNCTION public.get_system_user_holiday_breakdown()
RETURNS TABLE(
  base_entitlement numeric, bank_holidays numeric, christmas_closure numeric,
  personal_taken numeric, personal_remaining numeric,
  sick_leave_remaining numeric, personal_days_remaining numeric,
  annual_leave_days numeric, public_holidays numeric,
  christmas_closure_days numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_system_user_id uuid;
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  SELECT id INTO v_system_user_id FROM public.system_users WHERE user_id = auth.uid() LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE(he.annual_leave_entitlement, su.annual_leave_entitlement, 25) AS base_entitlement,
    10::numeric AS bank_holidays,
    5::numeric AS christmas_closure,
    COALESCE(he.annual_leave_used, 0) AS personal_taken,
    COALESCE(he.annual_leave_entitlement, su.annual_leave_entitlement, 25) - 10 - 5 - COALESCE(he.annual_leave_used, 0) AS personal_remaining,
    COALESCE(he.sick_leave_entitlement, 10) - COALESCE(he.sick_leave_used, 0) AS sick_leave_remaining,
    COALESCE(he.personal_days_entitlement, 5) - COALESCE(he.personal_days_used, 0) AS personal_days_remaining,
    COALESCE(he.annual_leave_entitlement, su.annual_leave_entitlement, 25) AS annual_leave_days,
    10::numeric AS public_holidays,
    5::numeric AS christmas_closure_days
  FROM public.system_users su
  LEFT JOIN public.holiday_entitlements he ON he.user_id = su.id AND he.year = v_year
  WHERE su.user_id = auth.uid()
  LIMIT 1;
END;
$$;

-- get_remaining_leave_days
CREATE OR REPLACE FUNCTION public.get_remaining_leave_days(user_uuid uuid)
RETURNS TABLE(
  annual_leave_remaining numeric, sick_leave_remaining numeric, personal_days_remaining numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_system_user_id uuid;
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  SELECT id INTO v_system_user_id FROM public.system_users WHERE user_id = user_uuid LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE(he.annual_leave_entitlement, 25) - COALESCE(he.annual_leave_used, 0) AS annual_leave_remaining,
    COALESCE(he.sick_leave_entitlement, 10) - COALESCE(he.sick_leave_used, 0) AS sick_leave_remaining,
    COALESCE(he.personal_days_entitlement, 5) - COALESCE(he.personal_days_used, 0) AS personal_days_remaining
  FROM public.holiday_entitlements he
  WHERE he.user_id = COALESCE(v_system_user_id, user_uuid) AND he.year = v_year
  LIMIT 1;
END;
$$;

-- get_system_user_name_secure
CREATE OR REPLACE FUNCTION public.get_system_user_name_secure(system_user_id uuid)
RETURNS TABLE(name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT su.name FROM public.system_users su WHERE su.id = system_user_id LIMIT 1;
$$;

-- ============================================================
-- 4. STAFF / EMPLOYEE DATA RPCs
-- ============================================================

-- get_staff_data_secure_with_audit
CREATE OR REPLACE FUNCTION public.get_staff_data_secure_with_audit(access_reason text)
RETURNS SETOF staff_details
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Log access
  INSERT INTO public.staff_data_access_audit (accessed_by, data_type, action)
  VALUES (auth.uid(), 'staff_details', access_reason);

  RETURN QUERY SELECT * FROM public.staff_details ORDER BY name;
END;
$$;

-- get_my_basic_staff_info
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
         sd.emergency_contact_name, sd.emergency_contact_phone, sd.emergency_contact_relationship,
         sd.city, sd.created_at, sd.updated_at
  FROM public.staff_details sd
  WHERE sd.user_id = auth.uid();
$$;

-- get_employee_basic_info_secure
CREATE OR REPLACE FUNCTION public.get_employee_basic_info_secure()
RETURNS TABLE(
  id uuid, auth_user_id uuid, name text, email text, phone_number text,
  role text, status text, department text, job_position text,
  is_system_user boolean, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cu.id, cu.auth_user_id, cu.name, cu.email, cu.phone_number,
         cu.role, cu.status, cu.department, cu.position,
         COALESCE(cu.is_system_user, false), cu.created_at, cu.updated_at
  FROM public.comprehensive_users cu
  WHERE cu.auth_user_id = auth.uid()
  ORDER BY cu.name;
$$;

-- get_employee_sensitive_data_secure
CREATE OR REPLACE FUNCTION public.get_employee_sensitive_data_secure(target_user_id uuid, access_reason text)
RETURNS TABLE(
  user_id uuid, date_of_birth date, emergency_contact_name text,
  emergency_contact_phone text, emergency_contact_relationship text,
  full_address text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_admin_or_higher() OR auth.uid() = target_user_id) THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Access denied to sensitive employee data';
  END IF;

  -- Log access
  INSERT INTO public.sensitive_data_access_log (accessed_by, table_name, action, target_user_id)
  VALUES (auth.uid(), 'employee_sensitive_data', access_reason, target_user_id);

  RETURN QUERY
  SELECT esd.user_id, esd.date_of_birth, esd.emergency_contact_name,
         esd.emergency_contact_phone, esd.emergency_contact_relationship,
         esd.full_address, esd.created_at, esd.updated_at
  FROM public.employee_sensitive_data esd
  WHERE esd.user_id = target_user_id;
END;
$$;

-- update_basic_user_info
CREATE OR REPLACE FUNCTION public.update_basic_user_info(user_uuid uuid, new_phone_number text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() != user_uuid AND NOT is_admin_or_higher() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.comprehensive_users SET
    phone_number = COALESCE(new_phone_number, phone_number),
    updated_at = now()
  WHERE auth_user_id = user_uuid;
END;
$$;

-- get_staff_basic_info_secure
CREATE OR REPLACE FUNCTION public.get_staff_basic_info_secure()
RETURNS TABLE(id uuid, name text, email text, role text, status text, department text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT su.id, su.name, su.email, su.role, su.status, su.department
  FROM public.system_users su
  WHERE su.status = 'Active'
  ORDER BY su.name;
$$;

-- can_access_sensitive_financial_data
CREATE OR REPLACE FUNCTION public.can_access_sensitive_financial_data()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT is_admin_or_higher();
$$;

-- log_sensitive_data_access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(employee_id text, action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.sensitive_data_audit (user_id, accessed_table, action, accessed_field)
  VALUES (auth.uid(), 'employee_data', action, employee_id);
END;
$$;

-- ============================================================
-- 5. CHAT RPCs
-- ============================================================

-- create_direct_message_room
CREATE OR REPLACE FUNCTION public.create_direct_message_room(target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room_id uuid;
  v_caller uuid := auth.uid();
BEGIN
  -- Check if DM room already exists between these two users
  SELECT cr.id INTO v_room_id
  FROM public.chat_rooms cr
  WHERE cr.type = 'dm'
    AND EXISTS (SELECT 1 FROM public.chat_room_members m1 WHERE m1.room_id = cr.id AND m1.user_id = v_caller)
    AND EXISTS (SELECT 1 FROM public.chat_room_members m2 WHERE m2.room_id = cr.id AND m2.user_id = target_user_id)
  LIMIT 1;

  IF v_room_id IS NOT NULL THEN
    RETURN v_room_id;
  END IF;

  -- Create new DM room
  INSERT INTO public.chat_rooms (name, type, created_by)
  VALUES (NULL, 'dm', v_caller)
  RETURNING id INTO v_room_id;

  -- Add both users
  INSERT INTO public.chat_room_members (room_id, user_id) VALUES (v_room_id, v_caller);
  INSERT INTO public.chat_room_members (room_id, user_id) VALUES (v_room_id, target_user_id);

  RETURN v_room_id;
END;
$$;

-- ============================================================
-- 6. REALTIME PUBLICATION UPDATES
-- ============================================================

-- Add tables to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'noticeboard'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.noticeboard;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'user_statuses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_statuses;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'holiday_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.holiday_requests;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notifications;
  END IF;
END $$;
