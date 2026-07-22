-- Add annual leave entitlement field to staff_details table
ALTER TABLE public.staff_details 
ADD COLUMN annual_leave_entitlement NUMERIC(5,2) DEFAULT 25.00;