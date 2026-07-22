-- Fix foreign key constraint issue for staff_details table
-- Allow staff members to exist without being system users

-- First, let's make user_id nullable and remove the foreign key constraint if it exists
ALTER TABLE public.staff_details 
ALTER COLUMN user_id DROP NOT NULL;

-- Drop the foreign key constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'staff_details_user_id_fkey' 
        AND table_name = 'staff_details'
    ) THEN
        ALTER TABLE public.staff_details DROP CONSTRAINT staff_details_user_id_fkey;
    END IF;
END $$;

-- Update the staff creation logic to handle non-system users
-- We'll use a trigger to ensure proper user_id handling