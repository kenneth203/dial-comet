
-- 1. Update trigger to honour a transaction-local bypass flag
CREATE OR REPLACE FUNCTION public.prevent_duplicate_customers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  match record;
  reason text;
BEGIN
  -- Per-transaction bypass: set by add_customer_secure when user confirms override
  IF current_setting('app.skip_duplicate_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.duplicate_detection_settings LIMIT 1;
  IF s IS NULL OR s.enforcement <> 'block' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO match FROM public.find_customer_duplicates(
    NEW.id, NEW.name, NEW.email, NEW.tel, NEW.mobile,
    concat_ws(' ', NEW.address_line1, NEW.address_line2, NEW.city, NEW.postcode, NEW.address)
  ) LIMIT 1;

  IF match.id IS NOT NULL THEN
    reason := array_to_string(match.reasons, ', ');
    RAISE EXCEPTION 'DUPLICATE_CUSTOMER: "%" looks like an existing customer "%" (matched on: %). Please edit the existing record instead.',
      NEW.name, match.name, COALESCE(NULLIF(reason,''), 'similarity');
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Recreate add_customer_secure with extra p_skip_duplicate_check parameter
DROP FUNCTION IF EXISTS public.add_customer_secure(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, date, text, jsonb, jsonb, text, jsonb, text, text, jsonb, jsonb, jsonb, text, text, text, text, text, text, text, text, jsonb, text, numeric, numeric, text, numeric, integer, numeric, text, numeric, numeric, integer, text, numeric, text, numeric, integer, numeric, jsonb, numeric
);

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
  p_va_price numeric DEFAULT 0,
  p_skip_duplicate_check boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_skip_duplicate_check THEN
    -- Transaction-local: only affects this INSERT
    PERFORM set_config('app.skip_duplicate_check', 'on', true);
  END IF;

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
