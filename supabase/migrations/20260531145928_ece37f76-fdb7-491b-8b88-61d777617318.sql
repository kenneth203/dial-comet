
-- Advanced near-duplicate detection for customers
-- Enables pg_trgm for fuzzy name similarity, normalises phone & address,
-- and adds a configurable settings row driving the trigger.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Settings table (single row) -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.duplicate_detection_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_similarity_threshold numeric NOT NULL DEFAULT 0.85
    CHECK (name_similarity_threshold >= 0 AND name_similarity_threshold <= 1),
  match_email boolean NOT NULL DEFAULT true,
  match_phone boolean NOT NULL DEFAULT true,
  match_address boolean NOT NULL DEFAULT true,
  address_similarity_threshold numeric NOT NULL DEFAULT 0.80
    CHECK (address_similarity_threshold >= 0 AND address_similarity_threshold <= 1),
  enforcement text NOT NULL DEFAULT 'block' CHECK (enforcement IN ('block','warn','off')),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.duplicate_detection_settings TO authenticated;
GRANT ALL ON public.duplicate_detection_settings TO service_role;

ALTER TABLE public.duplicate_detection_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY dup_set_select_auth ON public.duplicate_detection_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dup_set_update_admin ON public.duplicate_detection_settings
  FOR UPDATE TO authenticated USING (is_admin_or_higher());
CREATE POLICY dup_set_insert_admin ON public.duplicate_detection_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_higher());

INSERT INTO public.duplicate_detection_settings (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- 2. Normalisation helpers -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_customer_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(coalesce(p,'')),
        '\m(ltd|limited|llp|llc|inc|incorporated|plc|co|company|the|and|&)\M',
        ' ', 'gi'
      ),
      '[^a-z0-9]+', ' ', 'g'
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 10), '')
$$;

CREATE OR REPLACE FUNCTION public.normalize_address(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(
    regexp_replace(lower(coalesce(p,'')), '[^a-z0-9]+', ' ', 'g'),
    ''
  )
$$;

-- 3. RPC: find potential duplicates --------------------------------------------
CREATE OR REPLACE FUNCTION public.find_customer_duplicates(
  p_exclude_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_mobile text,
  p_address text
)
RETURNS TABLE (
  id uuid,
  name text,
  score numeric,
  reasons text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  n_name text := normalize_customer_name(p_name);
  n_email text := lower(trim(coalesce(p_email,'')));
  n_phone text := normalize_phone(p_phone);
  n_mobile text := normalize_phone(p_mobile);
  n_addr text := normalize_address(p_address);
BEGIN
  SELECT * INTO s FROM public.duplicate_detection_settings LIMIT 1;
  IF s IS NULL OR s.enforcement = 'off' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    GREATEST(
      CASE WHEN n_name IS NOT NULL
           THEN similarity(normalize_customer_name(c.name), n_name) ELSE 0 END,
      CASE WHEN s.match_address AND n_addr IS NOT NULL
           THEN similarity(
             normalize_address(concat_ws(' ', c.address_line1, c.address_line2, c.city, c.postcode, c.address)),
             n_addr
           ) ELSE 0 END
    )::numeric AS score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN n_name IS NOT NULL
            AND similarity(normalize_customer_name(c.name), n_name) >= s.name_similarity_threshold
           THEN 'name' END,
      CASE WHEN s.match_email AND n_email <> ''
            AND lower(trim(coalesce(c.email,''))) = n_email
           THEN 'email' END,
      CASE WHEN s.match_phone AND n_phone IS NOT NULL
            AND (normalize_phone(c.tel) = n_phone OR normalize_phone(c.mobile) = n_phone OR normalize_phone(c.phone) = n_phone)
           THEN 'phone' END,
      CASE WHEN s.match_phone AND n_mobile IS NOT NULL
            AND (normalize_phone(c.tel) = n_mobile OR normalize_phone(c.mobile) = n_mobile OR normalize_phone(c.phone) = n_mobile)
           THEN 'mobile' END,
      CASE WHEN s.match_address AND n_addr IS NOT NULL
            AND similarity(
                  normalize_address(concat_ws(' ', c.address_line1, c.address_line2, c.city, c.postcode, c.address)),
                  n_addr
                ) >= s.address_similarity_threshold
           THEN 'address' END
    ], NULL) AS reasons
  FROM public.customers c
  WHERE (p_exclude_id IS NULL OR c.id <> p_exclude_id)
    AND (
      (n_name IS NOT NULL AND similarity(normalize_customer_name(c.name), n_name) >= s.name_similarity_threshold)
      OR (s.match_email AND n_email <> '' AND lower(trim(coalesce(c.email,''))) = n_email)
      OR (s.match_phone AND n_phone IS NOT NULL
          AND (normalize_phone(c.tel) = n_phone OR normalize_phone(c.mobile) = n_phone OR normalize_phone(c.phone) = n_phone))
      OR (s.match_phone AND n_mobile IS NOT NULL
          AND (normalize_phone(c.tel) = n_mobile OR normalize_phone(c.mobile) = n_mobile OR normalize_phone(c.phone) = n_mobile))
      OR (s.match_address AND n_addr IS NOT NULL
          AND similarity(
                normalize_address(concat_ws(' ', c.address_line1, c.address_line2, c.city, c.postcode, c.address)),
                n_addr
              ) >= s.address_similarity_threshold)
    )
  ORDER BY score DESC
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_customer_duplicates(uuid,text,text,text,text,text) TO authenticated;

-- 4. Replace trigger with advanced detection ----------------------------------
CREATE OR REPLACE FUNCTION public.prevent_duplicate_customers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  match record;
  reason text;
BEGIN
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

DROP TRIGGER IF EXISTS trg_prevent_duplicate_customers ON public.customers;
CREATE TRIGGER trg_prevent_duplicate_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_customers();
