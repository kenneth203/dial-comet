
-- 1. Restrict get_all_customers_secure to hide Lead-status rows from non-admins
CREATE OR REPLACE FUNCTION public.get_all_customers_secure()
RETURNS SETOF public.customers
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.customers
  WHERE public.is_admin_or_higher() OR status IS DISTINCT FROM 'Lead'
  ORDER BY name;
$function$;

-- 2a. Add ownership/admin guard to update_customer_script
CREATE OR REPLACE FUNCTION public.update_customer_script(
  p_id uuid,
  p_script text DEFAULT NULL,
  p_script_tags jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required';
  END IF;
  IF NOT (
    public.is_admin_or_higher()
    OR EXISTS (SELECT 1 FROM public.customers WHERE id = p_id AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.customers SET
    script = COALESCE(p_script, script),
    script_tags = COALESCE(p_script_tags, script_tags),
    updated_at = now()
  WHERE id = p_id;
END;
$function$;

-- 2b. Add ownership/admin guard to update_customer_secure (body unchanged apart from guard)
CREATE OR REPLACE FUNCTION public.update_customer_secure(
  p_id uuid,
  p_name text DEFAULT NULL, p_business_type text DEFAULT NULL,
  p_address_line1 text DEFAULT NULL, p_address_line2 text DEFAULT NULL,
  p_city text DEFAULT NULL, p_postcode text DEFAULT NULL,
  p_tel text DEFAULT NULL, p_mobile text DEFAULT NULL,
  p_email text DEFAULT NULL, p_website text DEFAULT NULL,
  p_status text DEFAULT NULL, p_contact text DEFAULT NULL,
  p_phone text DEFAULT NULL, p_calls_per_month text DEFAULT NULL,
  p_billing_day date DEFAULT NULL, p_billing_options text DEFAULT NULL,
  p_billing_status jsonb DEFAULT NULL, p_additional_services jsonb DEFAULT NULL,
  p_call_handling_tier text DEFAULT NULL, p_services jsonb DEFAULT NULL,
  p_virtual_assistant_plan text DEFAULT NULL, p_call_answering_plan text DEFAULT NULL,
  p_packages jsonb DEFAULT NULL, p_contacts jsonb DEFAULT NULL,
  p_locations jsonb DEFAULT NULL, p_outcome_how text DEFAULT NULL,
  p_outcome_when text DEFAULT NULL, p_outcome_format text DEFAULT NULL,
  p_message_selection text DEFAULT NULL, p_filters text DEFAULT NULL,
  p_system_link text DEFAULT NULL, p_system_icon text DEFAULT NULL,
  p_script text DEFAULT NULL, p_script_tags jsonb DEFAULT NULL,
  p_va_package text DEFAULT NULL, p_va_packaged_hours numeric DEFAULT NULL,
  p_va_hourly_overage_rate numeric DEFAULT NULL, p_vr_package text DEFAULT NULL,
  p_vr_price numeric DEFAULT NULL, p_vr_included_minutes integer DEFAULT NULL,
  p_vr_overage_rate numeric DEFAULT NULL, p_ai_package text DEFAULT NULL,
  p_ai_setup_fee numeric DEFAULT NULL, p_ai_monthly_fee numeric DEFAULT NULL,
  p_ai_calls_allocated integer DEFAULT NULL, p_dt_package text DEFAULT NULL,
  p_dt_price_per_minute numeric DEFAULT NULL, p_cl_package text DEFAULT NULL,
  p_cl_price numeric DEFAULT NULL, p_cl_included_minutes integer DEFAULT NULL,
  p_cl_overage_rate numeric DEFAULT NULL, p_lead_metadata jsonb DEFAULT NULL,
  p_va_price numeric DEFAULT NULL, p_account_id uuid DEFAULT NULL,
  p_clear_account boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required';
  END IF;
  IF NOT (
    public.is_admin_or_higher()
    OR EXISTS (SELECT 1 FROM public.customers WHERE id = p_id AND user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.customers SET
    name = COALESCE(p_name, name),
    business_type = COALESCE(p_business_type, business_type),
    address_line1 = COALESCE(p_address_line1, address_line1),
    address_line2 = COALESCE(p_address_line2, address_line2),
    city = COALESCE(p_city, city),
    postcode = COALESCE(p_postcode, postcode),
    tel = COALESCE(p_tel, tel),
    mobile = COALESCE(p_mobile, mobile),
    email = COALESCE(p_email, email),
    website = COALESCE(p_website, website),
    status = COALESCE(p_status, status),
    contact = COALESCE(p_contact, contact),
    phone = COALESCE(p_phone, phone),
    calls_per_month = COALESCE(p_calls_per_month, calls_per_month),
    billing_day = COALESCE(p_billing_day, billing_day),
    billing_options = COALESCE(p_billing_options, billing_options),
    billing_status = COALESCE(p_billing_status, billing_status),
    additional_services = COALESCE(p_additional_services, additional_services),
    call_handling_tier = COALESCE(p_call_handling_tier, call_handling_tier),
    services = COALESCE(p_services, services),
    virtual_assistant_plan = COALESCE(p_virtual_assistant_plan, virtual_assistant_plan),
    call_answering_plan = COALESCE(p_call_answering_plan, call_answering_plan),
    packages = COALESCE(p_packages, packages),
    contacts = COALESCE(p_contacts, contacts),
    locations = COALESCE(p_locations, locations),
    outcome_how = COALESCE(p_outcome_how, outcome_how),
    outcome_when = COALESCE(p_outcome_when, outcome_when),
    outcome_format = COALESCE(p_outcome_format, outcome_format),
    message_selection = COALESCE(p_message_selection, message_selection),
    filters = COALESCE(p_filters, filters),
    system_link = COALESCE(p_system_link, system_link),
    system_icon = COALESCE(p_system_icon, system_icon),
    script = COALESCE(p_script, script),
    script_tags = COALESCE(p_script_tags, script_tags),
    va_package = COALESCE(p_va_package, va_package),
    va_packaged_hours = COALESCE(p_va_packaged_hours, va_packaged_hours),
    va_hourly_overage_rate = COALESCE(p_va_hourly_overage_rate, va_hourly_overage_rate),
    va_price = COALESCE(p_va_price, va_price),
    vr_package = COALESCE(p_vr_package, vr_package),
    vr_price = COALESCE(p_vr_price, vr_price),
    vr_included_minutes = COALESCE(p_vr_included_minutes, vr_included_minutes),
    vr_overage_rate = COALESCE(p_vr_overage_rate, vr_overage_rate),
    ai_package = COALESCE(p_ai_package, ai_package),
    ai_setup_fee = COALESCE(p_ai_setup_fee, ai_setup_fee),
    ai_monthly_fee = COALESCE(p_ai_monthly_fee, ai_monthly_fee),
    ai_calls_allocated = COALESCE(p_ai_calls_allocated, ai_calls_allocated),
    dt_package = COALESCE(p_dt_package, dt_package),
    dt_price_per_minute = COALESCE(p_dt_price_per_minute, dt_price_per_minute),
    cl_package = COALESCE(p_cl_package, cl_package),
    cl_price = COALESCE(p_cl_price, cl_price),
    cl_included_minutes = COALESCE(p_cl_included_minutes, cl_included_minutes),
    cl_overage_rate = COALESCE(p_cl_overage_rate, cl_overage_rate),
    lead_metadata = COALESCE(p_lead_metadata, lead_metadata),
    account_id = CASE WHEN p_clear_account THEN NULL ELSE COALESCE(p_account_id, account_id) END,
    updated_at = now()
  WHERE id = p_id;
END;
$function$;

-- 3. Tighten checklist_logs SELECT policy to owners, instance owners, or admins
DROP POLICY IF EXISTS checklist_logs_select_all ON public.checklist_logs;
CREATE POLICY checklist_logs_select_scoped
ON public.checklist_logs
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_higher()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.checklist_instances ci
    WHERE ci.id = checklist_logs.instance_id
      AND ci.user_id = auth.uid()
  )
);

-- 4. Add WITH CHECK on chat_message_deletion_audit inserts (prevent forged rows)
DROP POLICY IF EXISTS "Users can insert chat deletion audit" ON public.chat_message_deletion_audit;
CREATE POLICY "Users can insert own chat deletion audit"
ON public.chat_message_deletion_audit
FOR INSERT
TO authenticated
WITH CHECK (deleted_by = auth.uid());

-- 5. Scope service-role-only policies to the service_role grantee (defense in depth)
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read send log" ON public.email_send_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update send log" ON public.email_send_log
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
