
-- Tighten proposal_invoices SELECT to admins or creator
DROP POLICY IF EXISTS prop_inv_select_auth ON public.proposal_invoices;
CREATE POLICY prop_inv_select_admin_or_creator ON public.proposal_invoices
  FOR SELECT TO authenticated
  USING (public.is_admin_or_higher() OR created_by = auth.uid());

-- Tighten recurring_invoice_schedules SELECT to admins
DROP POLICY IF EXISTS ris_select_auth ON public.recurring_invoice_schedules;
CREATE POLICY ris_select_admin ON public.recurring_invoice_schedules
  FOR SELECT TO authenticated
  USING (public.is_admin_or_higher());

-- Remove unused/unprotected ni_number column from system_users
ALTER TABLE public.system_users DROP COLUMN IF EXISTS ni_number;

-- Tighten customers UPDATE: admins or record owner
DROP POLICY IF EXISTS customers_update_auth ON public.customers;
CREATE POLICY customers_update_admin_or_owner ON public.customers
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_higher() OR user_id = auth.uid())
  WITH CHECK (public.is_admin_or_higher() OR user_id = auth.uid());

-- Tighten task_notifications INSERT: only admins or self-targeted
DROP POLICY IF EXISTS task_notif_insert_auth ON public.task_notifications;
CREATE POLICY task_notif_insert_admin_or_self ON public.task_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_higher() OR user_id = auth.uid());

-- Storage policies for invoice-pdfs bucket
DROP POLICY IF EXISTS "Authenticated upload invoice pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update invoice pdfs" ON storage.objects;

CREATE POLICY "Admins can read invoice pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.is_admin_or_higher());

CREATE POLICY "Admins can upload invoice pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-pdfs' AND public.is_admin_or_higher());

CREATE POLICY "Admins can update invoice pdfs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.is_admin_or_higher())
  WITH CHECK (bucket_id = 'invoice-pdfs' AND public.is_admin_or_higher());

CREATE POLICY "Admins can delete invoice pdfs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.is_admin_or_higher());
