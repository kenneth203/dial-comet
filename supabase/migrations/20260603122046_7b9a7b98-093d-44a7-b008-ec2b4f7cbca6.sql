-- Brute-force protection table + RPCs
CREATE TABLE IF NOT EXISTS public.auth_failed_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_lower text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.auth_failed_attempts TO service_role;
-- No grants to anon/authenticated: only the SECURITY DEFINER RPCs below touch this table.

ALTER TABLE public.auth_failed_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS auth_failed_attempts_lookup_idx
  ON public.auth_failed_attempts (email_lower, attempted_at DESC);

-- Sliding window: 5 failures in 15 minutes -> locked for 15 minutes
CREATE OR REPLACE FUNCTION public.check_login_allowed(p_email text)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count integer;
  v_last timestamptz;
BEGIN
  IF v_email = '' THEN
    allowed := true; retry_after_seconds := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*), MAX(attempted_at)
    INTO v_count, v_last
  FROM public.auth_failed_attempts
  WHERE email_lower = v_email
    AND attempted_at > now() - interval '15 minutes';

  IF v_count >= 5 THEN
    allowed := false;
    retry_after_seconds := GREATEST(
      0,
      EXTRACT(EPOCH FROM ((v_last + interval '15 minutes') - now()))::integer
    );
  ELSE
    allowed := true;
    retry_after_seconds := 0;
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF v_email = '' THEN RETURN; END IF;
  INSERT INTO public.auth_failed_attempts (email_lower) VALUES (v_email);
  -- Opportunistic prune of rows older than 24h to keep table small
  DELETE FROM public.auth_failed_attempts
   WHERE attempted_at < now() - interval '24 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_failed_logins(p_email text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF v_email = '' THEN RETURN; END IF;
  DELETE FROM public.auth_failed_attempts WHERE email_lower = v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_login_allowed(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_failed_logins(text) TO anon, authenticated;