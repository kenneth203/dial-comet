-- Update staff_details table to include system user fields
ALTER TABLE public.staff_details 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS role text DEFAULT 'Operator',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active',
ADD COLUMN IF NOT EXISTS is_system_user boolean DEFAULT false;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_staff_details_email ON public.staff_details(email);
CREATE INDEX IF NOT EXISTS idx_staff_details_user_id ON public.staff_details(user_id);

-- Add RLS policy for admins to insert staff details
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_details' AND policyname = 'Admins can insert staff details') THEN
        CREATE POLICY "Admins can insert staff details" 
        ON public.staff_details 
        FOR INSERT 
        WITH CHECK (is_admin_or_higher());
    END IF;
END $$;