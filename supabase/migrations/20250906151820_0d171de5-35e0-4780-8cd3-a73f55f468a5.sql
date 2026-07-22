-- Fix Security Definer View issue by recreating holiday_data_anomalies view with proper security

-- Drop the existing view that has overly broad privileges
DROP VIEW IF EXISTS public.holiday_data_anomalies;

-- Recreate the view with proper security restrictions
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

-- Remove overly broad default privileges that were causing the security issue
REVOKE ALL ON public.holiday_data_anomalies FROM public;
REVOKE ALL ON public.holiday_data_anomalies FROM anon;
REVOKE ALL ON public.holiday_data_anomalies FROM authenticated;

-- Grant access only to service_role for admin operations
-- This ensures the view can only be accessed through proper backend functions
GRANT SELECT ON public.holiday_data_anomalies TO service_role;

-- Create a secure function to access this view instead of direct access
CREATE OR REPLACE FUNCTION public.get_holiday_data_anomalies()
RETURNS TABLE(
    request_id uuid,
    request_user_id uuid,
    system_user_id uuid,
    system_user_auth_id uuid,
    system_user_name text,
    start_date date,
    end_date date,
    status request_status,
    anomaly_type text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    -- Only allow admin users to access holiday data anomalies
    SELECT 
        hda.request_id,
        hda.request_user_id,
        hda.system_user_id,
        hda.system_user_auth_id,
        hda.system_user_name,
        hda.start_date,
        hda.end_date,
        hda.status,
        hda.anomaly_type
    FROM public.holiday_data_anomalies hda
    WHERE is_admin_or_higher();
$$;