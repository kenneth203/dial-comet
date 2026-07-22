-- Create enum for absence types
CREATE TYPE public.absence_type AS ENUM (
  'annual_leave',
  'sick_leave',
  'maternity_leave',
  'paternity_leave',
  'compassionate_leave',
  'study_leave',
  'unpaid_leave',
  'public_holiday'
);

-- Create enum for request status
CREATE TYPE public.request_status AS ENUM (
  'pending',
  'approved',
  'declined',
  'cancelled'
);

-- Create holiday entitlements table
CREATE TABLE public.holiday_entitlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  annual_leave_days DECIMAL(4,1) NOT NULL DEFAULT 25.0,
  sick_leave_days DECIMAL(4,1) NOT NULL DEFAULT 10.0,
  personal_days DECIMAL(4,1) NOT NULL DEFAULT 5.0,
  carried_over_days DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year)
);

-- Create holiday requests table
CREATE TABLE public.holiday_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  absence_type public.absence_type NOT NULL DEFAULT 'annual_leave',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(4,1) NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  decline_reason TEXT,
  google_calendar_event_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create staff details table for HR information
CREATE TABLE public.staff_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  employee_id TEXT UNIQUE,
  department TEXT,
  position TEXT,
  line_manager_id UUID REFERENCES auth.users(id),
  start_date DATE,
  contract_type TEXT DEFAULT 'full_time',
  working_hours_per_week DECIMAL(4,1) DEFAULT 37.5,
  salary DECIMAL(10,2),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'United Kingdom',
  phone_number TEXT,
  date_of_birth DATE,
  ni_number TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_sort_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.holiday_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies for holiday_entitlements
CREATE POLICY "Users can view their own entitlements" 
ON public.holiday_entitlements 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all entitlements" 
ON public.holiday_entitlements 
FOR SELECT 
USING (public.is_admin_or_higher());

CREATE POLICY "Admins can manage entitlements" 
ON public.holiday_entitlements 
FOR ALL 
USING (public.is_admin_or_higher());

-- RLS Policies for holiday_requests
CREATE POLICY "Users can view their own requests" 
ON public.holiday_requests 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own requests" 
ON public.holiday_requests 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending requests" 
ON public.holiday_requests 
FOR UPDATE 
USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins and Supervisors can view all requests" 
ON public.holiday_requests 
FOR SELECT 
USING (public.is_admin_or_higher());

CREATE POLICY "Admins and Supervisors can manage requests" 
ON public.holiday_requests 
FOR UPDATE 
USING (public.is_admin_or_higher());

-- RLS Policies for staff_details
CREATE POLICY "Users can view their own staff details" 
ON public.staff_details 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own basic details" 
ON public.staff_details 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all staff details" 
ON public.staff_details 
FOR SELECT 
USING (public.is_admin_or_higher());

CREATE POLICY "Admins can manage all staff details" 
ON public.staff_details 
FOR ALL 
USING (public.is_admin_or_higher());

-- Create triggers for updated_at columns
CREATE TRIGGER update_holiday_entitlements_updated_at
BEFORE UPDATE ON public.holiday_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_holiday_requests_updated_at
BEFORE UPDATE ON public.holiday_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_details_updated_at
BEFORE UPDATE ON public.staff_details
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_holiday_entitlements_user_year ON public.holiday_entitlements(user_id, year);
CREATE INDEX idx_holiday_requests_user_id ON public.holiday_requests(user_id);
CREATE INDEX idx_holiday_requests_status ON public.holiday_requests(status);
CREATE INDEX idx_holiday_requests_dates ON public.holiday_requests(start_date, end_date);
CREATE INDEX idx_staff_details_user_id ON public.staff_details(user_id);
CREATE INDEX idx_staff_details_employee_id ON public.staff_details(employee_id);

-- Function to calculate working days between two dates (excluding weekends)
CREATE OR REPLACE FUNCTION public.calculate_working_days(start_date DATE, end_date DATE)
RETURNS DECIMAL(4,1)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  working_days DECIMAL(4,1) := 0;
  current_date DATE := start_date;
BEGIN
  WHILE current_date <= end_date LOOP
    -- Check if it's not a weekend (Saturday = 6, Sunday = 0)
    IF EXTRACT(DOW FROM current_date) NOT IN (0, 6) THEN
      working_days := working_days + 1;
    END IF;
    current_date := current_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN working_days;
END;
$$;

-- Function to get user's remaining leave days
CREATE OR REPLACE FUNCTION public.get_remaining_leave_days(user_uuid UUID, leave_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS TABLE(
  annual_leave_remaining DECIMAL(4,1),
  sick_leave_remaining DECIMAL(4,1),
  personal_days_remaining DECIMAL(4,1)
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH entitlements AS (
    SELECT 
      COALESCE(annual_leave_days, 25.0) + COALESCE(carried_over_days, 0.0) as total_annual,
      COALESCE(sick_leave_days, 10.0) as total_sick,
      COALESCE(personal_days, 5.0) as total_personal
    FROM public.holiday_entitlements 
    WHERE user_id = user_uuid AND year = leave_year
  ),
  used_days AS (
    SELECT 
      COALESCE(SUM(CASE WHEN absence_type = 'annual_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_annual,
      COALESCE(SUM(CASE WHEN absence_type = 'sick_leave' AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_sick,
      COALESCE(SUM(CASE WHEN absence_type IN ('personal_leave', 'compassionate_leave') AND status = 'approved' THEN total_days ELSE 0 END), 0) as used_personal
    FROM public.holiday_requests 
    WHERE user_id = user_uuid 
      AND EXTRACT(YEAR FROM start_date) = leave_year
  )
  SELECT 
    COALESCE(e.total_annual, 25.0) - COALESCE(u.used_annual, 0) as annual_leave_remaining,
    COALESCE(e.total_sick, 10.0) - COALESCE(u.used_sick, 0) as sick_leave_remaining,
    COALESCE(e.total_personal, 5.0) - COALESCE(u.used_personal, 0) as personal_days_remaining
  FROM entitlements e
  CROSS JOIN used_days u;
$$;