CREATE OR REPLACE FUNCTION public.can_access_customer_billing_data(target_customer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    target_customer_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Super-Admin', 'HR', 'Admin')
    )
    AND EXISTS (
      SELECT 1 FROM public.billing_customers
      WHERE customer_id = target_customer_id
    );
$function$