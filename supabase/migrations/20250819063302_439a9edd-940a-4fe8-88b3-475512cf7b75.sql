-- Add HR role to the user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'HR';