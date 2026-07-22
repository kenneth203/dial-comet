
-- Add 'Suspended' to user_status enum
ALTER TYPE public.user_status ADD VALUE IF NOT EXISTS 'Suspended';
