-- Fix add_customer_secure: allow all authenticated users (not just Admin/Super-Admin)
-- and include lead_metadata column in the INSERT
CREATE OR REPLACE FUNCTION public.add_customer_secure(
  p_name text,
  p_business_type text DEFAULT NULL,
  p_address_line1 text DEFAULT NULL,
  p_address_line2 text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_postcode text DEFAULT NULL,
  p_tel text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_status text DEFAULT 'Active',
  p_contact text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_calls_per_month text DEFAULT NULL,
  p_billing_day date DEFAULT NULL,
  p_billing_options text DEFAULT 'VAT',
  p_billing_status jsonb DEFAULT '[]'::jsonb,
  p_additional_services jsonb DEFAULT '[]'::jsonb,
  p_call_handling_tier text DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb,
  p_virtual_assistant_plan text DEFAULT NULL,
  p_call_answering_plan text DEFAULT NULL,
  p_packages jsonb DEFAULT '[]'::jsonb,
  p_contacts jsonb DEFAULT '[]'::jsonb,
  p_locations jsonb DEFAULT '[]'::jsonb,
  p_outcome_how text DEFAULT NULL,
  p_outcome_when text DEFAULT NULL,
  p_outcome_format text DEFAULT NULL,
  p_message_selection text DEFAULT NULL,
  p_filters text DEFAULT NULL,
  p_system_link text DEFAULT NULL,
  p_system_icon text DEFAULT NULL,
  p_script text DEFAULT NULL,
  p_script_tags jsonb DEFAULT '[]'::jsonb,
  p_va_package text DEFAULT NULL,
  p_va_packaged_hours numeric DEFAULT 0,
  p_va_hourly_overage_rate numeric DEFAULT 0,
  p_vr_package text DEFAULT NULL,
  p_vr_price numeric DEFAULT 0,
  p_vr_included_minutes numeric DEFAULT 0,
  p_vr_overage_rate numeric DEFAULT 0,
  p_ai_package text DEFAULT NULL,
  p_ai_setup_fee numeric DEFAULT 0,
  p_ai_monthly_fee numeric DEFAULT 0,
  p_ai_calls_allocated numeric DEFAULT 0,
  p_dt_package text DEFAULT NULL,
  p_dt_price_per_minute numeric DEFAULT 0,
  p_lead_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_customer_id uuid;
BEGIN
  -- Allow all authenticated users to add customers
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required';
  END IF;

  -- Verify user has a profile
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: no profile found';
  END IF;

  INSERT INTO public.customers (
    user_id, name, business_type, address_line1, address_line2, city, postcode,
    tel, mobile, email, website, status, contact, phone, calls_per_month,
    billing_day, billing_options, billing_status, additional_services,
    call_handling_tier, services, virtual_assistant_plan, call_answering_plan,
    packages, contacts, locations, outcome_how, outcome_when, outcome_format,
    message_selection, filters, system_link, system_icon, script, script_tags,
    va_package, va_packaged_hours, va_hourly_overage_rate, vr_package, vr_price,
    vr_included_minutes, vr_overage_rate, ai_package, ai_setup_fee, ai_monthly_fee,
    ai_calls_allocated, dt_package, dt_price_per_minute, lead_metadata
  ) VALUES (
    auth.uid(), p_name, p_business_type, p_address_line1, p_address_line2, p_city,
    p_postcode, p_tel, p_mobile, p_email, p_website, p_status, p_contact, p_phone,
    p_calls_per_month, p_billing_day, p_billing_options, p_billing_status,
    p_additional_services, p_call_handling_tier, p_services, p_virtual_assistant_plan,
    p_call_answering_plan, p_packages, p_contacts, p_locations, p_outcome_how,
    p_outcome_when, p_outcome_format, p_message_selection, p_filters, p_system_link,
    p_system_icon, p_script, p_script_tags, p_va_package, p_va_packaged_hours,
    p_va_hourly_overage_rate, p_vr_package, p_vr_price, p_vr_included_minutes,
    p_vr_overage_rate, p_ai_package, p_ai_setup_fee, p_ai_monthly_fee,
    p_ai_calls_allocated, p_dt_package, p_dt_price_per_minute, p_lead_metadata
  )
  RETURNING id INTO new_customer_id;
  
  RETURN new_customer_id;
END;
$$;