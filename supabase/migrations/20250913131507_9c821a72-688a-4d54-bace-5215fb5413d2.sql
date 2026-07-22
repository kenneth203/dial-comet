-- Remove the problematic Security Definer View
-- This view is a dummy placeholder causing security issues and is not used in the codebase
-- The actual functionality is handled by secure functions: get_holiday_data_anomalies_secure()

DROP VIEW IF EXISTS public.holiday_data_anomalies;