-- Allow admins (and higher) to delete form submissions so that clicking the
-- trash icon in the CRM actually removes the record from the database.
DROP POLICY IF EXISTS form_sub_delete_admin ON public.form_submissions;
CREATE POLICY form_sub_delete_admin
ON public.form_submissions
FOR DELETE
TO authenticated
USING (public.is_admin_or_higher());
