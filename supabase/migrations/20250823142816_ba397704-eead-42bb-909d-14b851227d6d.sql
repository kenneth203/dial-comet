-- Fix security issue: Customer Billing Information Access Control
-- Create more granular RLS policies for billing tables

-- First, let's create a security function to check if user can access customer billing data
CREATE OR REPLACE FUNCTION public.can_access_customer_billing_data(target_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    -- Super-Admin and HR have full access
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role IN ('Super-Admin', 'HR')
    )
    OR
    -- Admins have access to billing data
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() 
      AND role = 'Admin'
    )
    OR
    -- Customer can access their own billing data
    EXISTS (
      SELECT 1 FROM public.customers 
      WHERE id = target_customer_id 
      AND user_id = auth.uid()
    );
$function$;

-- Drop existing overly restrictive policies for billing_customers
DROP POLICY IF EXISTS "Super-Admin can access billing_customers" ON public.billing_customers;

-- Create new granular policies for billing_customers
CREATE POLICY "Authorized personnel can view billing customers"
ON public.billing_customers
FOR SELECT
TO authenticated
USING (can_access_customer_billing_data(customer_id));

CREATE POLICY "HR and Super-Admin can insert billing customers"
ON public.billing_customers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
  )
);

CREATE POLICY "HR and Super-Admin can update billing customers"
ON public.billing_customers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
  )
);

CREATE POLICY "Super-Admin can delete billing customers"
ON public.billing_customers
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);

-- Drop existing overly restrictive policies for billing_invoices
DROP POLICY IF EXISTS "Super-Admin can access billing_invoices" ON public.billing_invoices;

-- Create new granular policies for billing_invoices
CREATE POLICY "Authorized personnel can view billing invoices"
ON public.billing_invoices
FOR SELECT
TO authenticated
USING (can_access_customer_billing_data(customer_id));

CREATE POLICY "HR and Super-Admin can insert billing invoices"
ON public.billing_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
  )
);

CREATE POLICY "HR and Super-Admin can update billing invoices"
ON public.billing_invoices
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('Super-Admin', 'HR')
  )
);

CREATE POLICY "Super-Admin can delete billing invoices"
ON public.billing_invoices
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);

-- Create audit logging for billing data access
CREATE TABLE IF NOT EXISTS public.billing_data_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_by uuid NOT NULL REFERENCES auth.users(id),
  customer_id uuid,
  action text NOT NULL,
  table_name text NOT NULL,
  accessed_at timestamp with time zone DEFAULT now(),
  ip_address inet,
  user_agent text
);

-- Enable RLS on audit table
ALTER TABLE public.billing_data_audit ENABLE ROW LEVEL SECURITY;

-- Only Super-Admin can view audit logs
CREATE POLICY "Super-Admin only billing audit access"
ON public.billing_data_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'Super-Admin'
  )
);

-- Prevent direct modifications to audit table
CREATE POLICY "No direct billing audit modifications"
ON public.billing_data_audit
FOR ALL
TO authenticated
USING (false);

-- Create function to log billing data access
CREATE OR REPLACE FUNCTION public.log_billing_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Log SELECT operations on sensitive billing data
  IF TG_OP = 'SELECT' THEN
    INSERT INTO public.billing_data_audit (
      accessed_by,
      customer_id,
      action,
      table_name
    ) VALUES (
      auth.uid(),
      COALESCE(NEW.customer_id, OLD.customer_id),
      TG_OP,
      TG_TABLE_NAME
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Note: Triggers for SELECT operations need to be implemented at application level
-- as PostgreSQL doesn't support SELECT triggers directly

-- Create function for secure billing data access with logging
CREATE OR REPLACE FUNCTION public.get_customer_billing_data_secure(target_customer_id uuid)
RETURNS TABLE(
  customer_id uuid,
  name text,
  rate_per_call numeric,
  rate_per_minute numeric,
  monthly_charge numeric,
  base_call_allowance integer,
  rate_sms numeric,
  rate_transfer_landline numeric,
  rate_transfer_mobile numeric,
  package_name text,
  active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role text;
BEGIN
  -- Get current user role
  SELECT role::text INTO user_role
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Check access permissions
  IF NOT can_access_customer_billing_data(target_customer_id) THEN
    RAISE EXCEPTION 'Access denied: Insufficient permissions to view billing data';
  END IF;
  
  -- Log the access
  INSERT INTO public.billing_data_audit (
    accessed_by,
    customer_id,
    action,
    table_name
  ) VALUES (
    auth.uid(),
    target_customer_id,
    'SECURE_ACCESS',
    'billing_customers'
  );
  
  -- Return billing data based on access level
  RETURN QUERY
  SELECT 
    bc.customer_id,
    bc.name,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR', 'Admin') THEN bc.rate_per_call
      ELSE NULL -- Hide rates from customers
    END as rate_per_call,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR', 'Admin') THEN bc.rate_per_minute
      ELSE NULL
    END as rate_per_minute,
    bc.monthly_charge, -- Customers can see their monthly charge
    bc.base_call_allowance,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR', 'Admin') THEN bc.rate_sms
      ELSE NULL
    END as rate_sms,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR', 'Admin') THEN bc.rate_transfer_landline
      ELSE NULL
    END as rate_transfer_landline,
    CASE 
      WHEN user_role IN ('Super-Admin', 'HR', 'Admin') THEN bc.rate_transfer_mobile
      ELSE NULL
    END as rate_transfer_mobile,
    bc.package_name,
    bc.active
  FROM public.billing_customers bc
  WHERE bc.customer_id = target_customer_id;
END;
$function$;

-- Create similar function for invoice data
CREATE OR REPLACE FUNCTION public.get_customer_invoices_secure(target_customer_id uuid)
RETURNS TABLE(
  invoice_id uuid,
  customer_id uuid,
  billing_period text,
  total_with_vat numeric,
  vat_rate numeric,
  total_invoice numeric,
  base_charge numeric,
  extra_charges numeric,
  calls_made integer,
  total_minutes numeric,
  created_on timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check access permissions
  IF NOT can_access_customer_billing_data(target_customer_id) THEN
    RAISE EXCEPTION 'Access denied: Insufficient permissions to view invoice data';
  END IF;
  
  -- Log the access
  INSERT INTO public.billing_data_audit (
    accessed_by,
    customer_id,
    action,
    table_name
  ) VALUES (
    auth.uid(),
    target_customer_id,
    'SECURE_ACCESS',
    'billing_invoices'
  );
  
  -- Return invoice data
  RETURN QUERY
  SELECT 
    bi.invoice_id,
    bi.customer_id,
    bi.billing_period,
    bi.total_with_vat,
    bi.vat_rate,
    bi.total_invoice,
    bi.base_charge,
    bi.extra_charges,
    bi.calls_made,
    bi.total_minutes,
    bi.created_on
  FROM public.billing_invoices bi
  WHERE bi.customer_id = target_customer_id
  ORDER BY bi.created_on DESC;
END;
$function$;