REVOKE SELECT (password_hash) ON public.document_shares FROM authenticated;
REVOKE SELECT (password_hash) ON public.document_shares FROM anon;