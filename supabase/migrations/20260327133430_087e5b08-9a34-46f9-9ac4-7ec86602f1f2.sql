DROP FUNCTION IF EXISTS get_all_customers_secure();

CREATE FUNCTION get_all_customers_secure()
RETURNS TABLE (
  id uuid, name text, business_type text, status text, city text, contact text,
  email text, phone text, tel text, mobile text, created_at timestamptz,
  address_line1 text, address_line2 text, postcode text, website text,
  calls_per_month text, billing_day text, billing_options text,
  billing_status jsonb, additional_services jsonb, call_handling_tier text,
  contacts jsonb, address text, locations jsonb,
  outcome_how text, outcome_when text, outcome_format text,
  message_selection text, filters text, system_link text, system_icon text,
  script text, script_tags jsonb, services jsonb,
  virtual_assistant_plan text, call_answering_plan text, packages jsonb,
  va_package text, va_packaged_hours numeric, va_hourly_overage_rate numeric,
  vr_package text, vr_price numeric, vr_included_minutes numeric, vr_overage_rate numeric,
  ai_package text, ai_setup_fee numeric, ai_monthly_fee numeric, ai_calls_allocated numeric,
  dt_package text, dt_price_per_minute numeric,
  cl_package text, cl_price numeric, cl_included_minutes integer, cl_overage_rate numeric,
  lead_metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  SELECT p.role::text INTO _role
  FROM profiles p
  WHERE p.user_id = auth.uid();

  IF _role IS NULL THEN
    RAISE EXCEPTION 'Access denied: no profile found';
  END IF;

  RETURN QUERY
  SELECT 
    c.id, c.name, c.business_type, c.status, c.city, c.contact,
    c.email, c.phone, c.tel, c.mobile, c.created_at,
    c.address_line1, c.address_line2, c.postcode, c.website,
    c.calls_per_month, c.billing_day, c.billing_options,
    c.billing_status, c.additional_services, c.call_handling_tier,
    c.contacts, c.address, c.locations,
    c.outcome_how, c.outcome_when, c.outcome_format,
    c.message_selection, c.filters, c.system_link, c.system_icon,
    c.script, c.script_tags, c.services,
    c.virtual_assistant_plan, c.call_answering_plan, c.packages,
    c.va_package, c.va_packaged_hours, c.va_hourly_overage_rate,
    c.vr_package, c.vr_price, c.vr_included_minutes, c.vr_overage_rate,
    c.ai_package, c.ai_setup_fee, c.ai_monthly_fee, c.ai_calls_allocated,
    c.dt_package, c.dt_price_per_minute,
    c.cl_package, c.cl_price, c.cl_included_minutes, c.cl_overage_rate,
    c.lead_metadata
  FROM public.customers c
  ORDER BY c.name;
END;
$$;