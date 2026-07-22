
DROP POLICY IF EXISTS customers_select_auth ON public.customers;

CREATE POLICY customers_select_auth
ON public.customers
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_higher()
  OR status <> 'Lead'
);
