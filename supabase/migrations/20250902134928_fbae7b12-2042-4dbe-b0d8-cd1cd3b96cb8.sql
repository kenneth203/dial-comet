-- Make user_id nullable in holiday_requests table to support system-only users
ALTER TABLE public.holiday_requests 
ALTER COLUMN user_id DROP NOT NULL;