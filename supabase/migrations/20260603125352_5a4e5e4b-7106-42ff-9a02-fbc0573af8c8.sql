
CREATE OR REPLACE FUNCTION public.get_email_send_log_admin(
  p_limit int DEFAULT 100,
  p_template text DEFAULT NULL
)
RETURNS TABLE (
  message_id text,
  template_name text,
  recipient_email text,
  status text,
  error_message text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_higher() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (l.message_id)
    l.message_id,
    l.template_name,
    l.recipient_email,
    l.status,
    l.error_message,
    l.created_at
  FROM public.email_send_log l
  WHERE l.message_id IS NOT NULL
    AND (p_template IS NULL OR l.template_name = p_template)
  ORDER BY l.message_id, l.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_send_log_admin(int, text) TO authenticated;
