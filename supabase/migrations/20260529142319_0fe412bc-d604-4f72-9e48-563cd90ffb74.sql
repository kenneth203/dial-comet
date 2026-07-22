
CREATE OR REPLACE FUNCTION public.update_customer_secure(
  p_id uuid,
  p_name text DEFAULT NULL, p_business_type text DEFAULT NULL, p_address_line1 text DEFAULT NULL,
  p_address_line2 text DEFAULT NULL, p_city text DEFAULT NULL, p_postcode text DEFAULT NULL,
  p_tel text DEFAULT NULL, p_mobile text DEFAULT NULL, p_email text DEFAULT NULL,
  p_website text DEFAULT NULL, p_status text DEFAULT NULL, p_contact text DEFAULT NULL,
  p_phone text DEFAULT NULL, p_calls_per_month text DEFAULT NULL, p_billing_day date DEFAULT NULL,
  p_billing_options text DEFAULT NULL, p_billing_status jsonb DEFAULT NULL,
  p_additional_services jsonb DEFAULT NULL, p_call_handling_tier text DEFAULT NULL,
  p_services jsonb DEFAULT NULL, p_virtual_assistant_plan text DEFAULT NULL,
  p_call_answering_plan text DEFAULT NULL, p_packages jsonb DEFAULT NULL,
  p_contacts jsonb DEFAULT NULL, p_locations jsonb DEFAULT NULL,
  p_outcome_how text DEFAULT NULL, p_outcome_when text DEFAULT NULL,
  p_outcome_format text DEFAULT NULL, p_message_selection text DEFAULT NULL,
  p_filters text DEFAULT NULL, p_system_link text DEFAULT NULL, p_system_icon text DEFAULT NULL,
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
  p_va_price numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    updated_at = now()
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_customer_secure(
  p_name text, p_business_type text DEFAULT NULL, p_address_line1 text DEFAULT NULL,
  p_address_line2 text DEFAULT NULL, p_city text DEFAULT NULL, p_postcode text DEFAULT NULL,
  p_tel text DEFAULT NULL, p_mobile text DEFAULT NULL, p_email text DEFAULT NULL,
  p_website text DEFAULT NULL, p_status text DEFAULT 'Active', p_contact text DEFAULT NULL,
  p_phone text DEFAULT NULL, p_calls_per_month text DEFAULT NULL, p_billing_day date DEFAULT NULL,
  p_billing_options text DEFAULT 'VAT', p_billing_status jsonb DEFAULT '[]'::jsonb,
  p_additional_services jsonb DEFAULT '[]'::jsonb, p_call_handling_tier text DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb, p_virtual_assistant_plan text DEFAULT NULL,
  p_call_answering_plan text DEFAULT NULL, p_packages jsonb DEFAULT '[]'::jsonb,
  p_contacts jsonb DEFAULT '[]'::jsonb, p_locations jsonb DEFAULT '[]'::jsonb,
  p_outcome_how text DEFAULT NULL, p_outcome_when text DEFAULT NULL,
  p_outcome_format text DEFAULT NULL, p_message_selection text DEFAULT NULL,
  p_filters text DEFAULT NULL, p_system_link text DEFAULT NULL, p_system_icon text DEFAULT NULL,
  p_script text DEFAULT NULL, p_script_tags jsonb DEFAULT '[]'::jsonb,
  p_va_package text DEFAULT NULL, p_va_packaged_hours numeric DEFAULT 0,
  p_va_hourly_overage_rate numeric DEFAULT 0, p_vr_package text DEFAULT NULL,
  p_vr_price numeric DEFAULT 0, p_vr_included_minutes integer DEFAULT 0,
  p_vr_overage_rate numeric DEFAULT 0, p_ai_package text DEFAULT NULL,
  p_ai_setup_fee numeric DEFAULT 0, p_ai_monthly_fee numeric DEFAULT 0,
  p_ai_calls_allocated integer DEFAULT 0, p_dt_package text DEFAULT NULL,
  p_dt_price_per_minute numeric DEFAULT 0, p_cl_package text DEFAULT NULL,
  p_cl_price numeric DEFAULT 0, p_cl_included_minutes integer DEFAULT 0,
  p_cl_overage_rate numeric DEFAULT 0, p_lead_metadata jsonb DEFAULT '{}'::jsonb,
  p_va_price numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.customers (
    user_id, name, business_type, address_line1, address_line2, city, postcode,
    tel, mobile, email, website, status, contact, phone, calls_per_month,
    billing_day, billing_options, billing_status, additional_services, call_handling_tier,
    services, virtual_assistant_plan, call_answering_plan, packages, contacts, locations,
    outcome_how, outcome_when, outcome_format, message_selection, filters,
    system_link, system_icon, script, script_tags,
    va_package, va_packaged_hours, va_hourly_overage_rate, va_price,
    vr_package, vr_price, vr_included_minutes, vr_overage_rate,
    ai_package, ai_setup_fee, ai_monthly_fee, ai_calls_allocated,
    dt_package, dt_price_per_minute,
    cl_package, cl_price, cl_included_minutes, cl_overage_rate,
    lead_metadata
  ) VALUES (
    auth.uid(), p_name, p_business_type, p_address_line1, p_address_line2, p_city, p_postcode,
    p_tel, p_mobile, p_email, p_website, p_status, p_contact, p_phone, p_calls_per_month,
    p_billing_day, p_billing_options, p_billing_status, p_additional_services, p_call_handling_tier,
    p_services, p_virtual_assistant_plan, p_call_answering_plan, p_packages, p_contacts, p_locations,
    p_outcome_how, p_outcome_when, p_outcome_format, p_message_selection, p_filters,
    p_system_link, p_system_icon, p_script, p_script_tags,
    p_va_package, p_va_packaged_hours, p_va_hourly_overage_rate, p_va_price,
    p_vr_package, p_vr_price, p_vr_included_minutes, p_vr_overage_rate,
    p_ai_package, p_ai_setup_fee, p_ai_monthly_fee, p_ai_calls_allocated,
    p_dt_package, p_dt_price_per_minute,
    p_cl_package, p_cl_price, p_cl_included_minutes, p_cl_overage_rate,
    p_lead_metadata
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
