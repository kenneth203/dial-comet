
-- Revoke inherited broad ACLs from anon/authenticated on suspension tables.
-- Match Stage A1 precedent (A1-F1 fix).
REVOKE ALL ON public.user_suspension_state       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_suspension_reservation FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_suspension_audit       FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.user_suspension_state       TO authenticated;
GRANT SELECT ON public.user_suspension_reservation TO authenticated;
GRANT SELECT ON public.user_suspension_audit       TO authenticated;

GRANT ALL ON public.user_suspension_state       TO service_role;
GRANT ALL ON public.user_suspension_reservation TO service_role;
GRANT ALL ON public.user_suspension_audit       TO service_role;
