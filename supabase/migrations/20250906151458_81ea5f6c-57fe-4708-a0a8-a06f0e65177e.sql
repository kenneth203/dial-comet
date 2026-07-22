-- Fix Security Definer View issue by recreating holiday_data_anomalies view with proper security

-- Drop the existing view that has overly broad privileges
DROP VIEW IF EXISTS public.holiday_data_anomalies;

-- Recreate the view with proper security restrictions
-- This view should only be accessible to admin users who can already access both tables
CREATE VIEW public.holiday_data_anomalies AS
SELECT 
    hr.id AS request_id,
    hr.user_id AS request_user_id,
    hr.system_user_id,
    su.user_id AS system_user_auth_id,
    su.name AS system_user_name,
    hr.start_date,
    hr.end_date,
    hr.status,
    CASE
        WHEN (hr.user_id <> su.user_id) THEN 'USER_ID_MISMATCH'::text
        WHEN (su.user_id IS NULL) THEN 'MISSING_AUTH_USER_ID'::text
        ELSE 'OK'::text
    END AS anomaly_type
FROM holiday_requests hr
LEFT JOIN system_users su ON (hr.system_user_id = su.id)
WHERE (hr.user_id <> su.user_id) OR (su.user_id IS NULL);

-- Enable RLS on the view (if supported) and restrict access to admin users only
ALTER TABLE public.holiday_data_anomalies ENABLE ROW LEVEL SECURITY;

-- Create RLS policy to restrict access to admin users only
CREATE POLICY "Admin only access to holiday data anomalies"
ON public.holiday_data_anomalies
FOR SELECT
TO authenticated
USING (is_admin_or_higher());

-- Revoke all default privileges from public roles
REVOKE ALL ON public.holiday_data_anomalies FROM anon;
REVOKE ALL ON public.holiday_data_anomalies FROM authenticated;
REVOKE ALL ON public.holiday_data_anomalies FROM service_role;

-- Grant specific access only to service_role for admin operations
GRANT SELECT ON public.holiday_data_anomalies TO service_role;