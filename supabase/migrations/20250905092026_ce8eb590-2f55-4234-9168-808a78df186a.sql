-- Shift Scheduler Database Schema

-- Create enums for shift scheduler
CREATE TYPE shift_status AS ENUM ('draft', 'active', 'cancelled', 'completed');
CREATE TYPE assignment_status AS ENUM ('assigned', 'open', 'at_risk', 'cancelled');
CREATE TYPE audit_action AS ENUM ('created', 'assigned', 'unassigned', 'modified', 'cancelled', 'swapped');
CREATE TYPE skill_level AS ENUM ('required', 'preferred', 'nice_to_have');

-- Shift Templates table
CREATE TABLE public.shift_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL, -- 0=Sunday, 1=Monday, etc.
  recurrence_type TEXT NOT NULL DEFAULT 'weekly', -- weekly, biweekly, monthly
  effective_start DATE NOT NULL,
  effective_end DATE,
  headcount INTEGER NOT NULL DEFAULT 1,
  role_name TEXT NOT NULL DEFAULT 'General',
  color_code TEXT NOT NULL DEFAULT '#3b82f6',
  skip_holidays BOOLEAN NOT NULL DEFAULT true,
  auto_assign BOOLEAN NOT NULL DEFAULT false,
  auto_assign_delay_minutes INTEGER NOT NULL DEFAULT 15,
  created_by UUID NOT NULL,
  status shift_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shift Instances table (generated from templates)
CREATE TABLE public.shift_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.shift_templates(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  headcount_needed INTEGER NOT NULL DEFAULT 1,
  headcount_assigned INTEGER NOT NULL DEFAULT 0,
  role_name TEXT NOT NULL,
  color_code TEXT NOT NULL DEFAULT '#3b82f6',
  status assignment_status NOT NULL DEFAULT 'open',
  is_holiday BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(template_id, shift_date)
);

-- Shift Assignments table
CREATE TABLE public.shift_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_instance_id UUID NOT NULL REFERENCES public.shift_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_by UUID NOT NULL,
  assignment_status assignment_status NOT NULL DEFAULT 'assigned',
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  swap_requested BOOLEAN NOT NULL DEFAULT false,
  swap_requested_at TIMESTAMP WITH TIME ZONE,
  swap_approved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Skills table
CREATE TABLE public.user_skills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  skill_name TEXT NOT NULL,
  skill_level skill_level NOT NULL DEFAULT 'required',
  verified_by UUID,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, skill_name)
);

-- Scheduler Settings table
CREATE TABLE public.scheduler_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shift Audit Log table
CREATE TABLE public.shift_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_instance_id UUID,
  assignment_id UUID,
  template_id UUID,
  user_id UUID,
  performed_by UUID NOT NULL,
  action audit_action NOT NULL,
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shift_templates
CREATE POLICY "Admins can manage shift templates"
ON public.shift_templates FOR ALL
USING (is_admin_or_higher());

CREATE POLICY "Users can view active shift templates"
ON public.shift_templates FOR SELECT
USING (status = 'active');

-- RLS Policies for shift_instances
CREATE POLICY "Admins can manage shift instances"
ON public.shift_instances FOR ALL
USING (is_admin_or_higher());

CREATE POLICY "Users can view shift instances"
ON public.shift_instances FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for shift_assignments  
CREATE POLICY "Admins can manage shift assignments"
ON public.shift_assignments FOR ALL
USING (is_admin_or_higher());

CREATE POLICY "Users can view their own assignments"
ON public.shift_assignments FOR SELECT
USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own assignment requests"
ON public.shift_assignments FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_skills
CREATE POLICY "Admins can manage user skills"
ON public.user_skills FOR ALL
USING (is_admin_or_higher());

CREATE POLICY "Users can view their own skills"
ON public.user_skills FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policies for scheduler_settings
CREATE POLICY "Admins can manage scheduler settings"
ON public.scheduler_settings FOR ALL
USING (is_admin_or_higher());

-- RLS Policies for shift_audit_log
CREATE POLICY "Admins can view audit log"
ON public.shift_audit_log FOR SELECT
USING (is_admin_or_higher());

CREATE POLICY "System can insert audit log"
ON public.shift_audit_log FOR INSERT
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_shift_instances_date ON public.shift_instances(shift_date);
CREATE INDEX idx_shift_instances_template ON public.shift_instances(template_id);
CREATE INDEX idx_shift_assignments_user ON public.shift_assignments(user_id);
CREATE INDEX idx_shift_assignments_instance ON public.shift_assignments(shift_instance_id);
CREATE INDEX idx_user_skills_user ON public.user_skills(user_id);
CREATE INDEX idx_audit_log_instance ON public.shift_audit_log(shift_instance_id);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_shift_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shift_templates_timestamp
  BEFORE UPDATE ON public.shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_shift_timestamp();

CREATE TRIGGER update_shift_instances_timestamp  
  BEFORE UPDATE ON public.shift_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_shift_timestamp();

CREATE TRIGGER update_shift_assignments_timestamp
  BEFORE UPDATE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_shift_timestamp();

-- Audit trigger for shift assignments
CREATE OR REPLACE FUNCTION public.audit_shift_assignment_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.shift_audit_log (
      assignment_id, shift_instance_id, user_id, performed_by, action, new_values
    ) VALUES (
      NEW.id, NEW.shift_instance_id, NEW.user_id, auth.uid(), 'assigned'::audit_action, 
      jsonb_build_object('user_id', NEW.user_id, 'assigned_by', NEW.assigned_by)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.shift_audit_log (
      assignment_id, shift_instance_id, user_id, performed_by, action, old_values, new_values
    ) VALUES (
      NEW.id, NEW.shift_instance_id, NEW.user_id, auth.uid(), 'modified'::audit_action,
      jsonb_build_object('status', OLD.assignment_status),
      jsonb_build_object('status', NEW.assignment_status)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.shift_audit_log (
      assignment_id, shift_instance_id, user_id, performed_by, action, old_values
    ) VALUES (
      OLD.id, OLD.shift_instance_id, OLD.user_id, auth.uid(), 'unassigned'::audit_action,
      jsonb_build_object('user_id', OLD.user_id)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_shift_assignments
  AFTER INSERT OR UPDATE OR DELETE ON public.shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_shift_assignment_changes();

-- Function to generate shift instances from templates
CREATE OR REPLACE FUNCTION public.generate_shift_instances(
  template_id_param UUID,
  start_date_param DATE,
  end_date_param DATE
) RETURNS INTEGER AS $$
DECLARE
  template_record RECORD;
  current_date DATE;
  day_of_week INTEGER;
  instances_created INTEGER := 0;
  shift_datetime TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get template details
  SELECT * INTO template_record 
  FROM public.shift_templates 
  WHERE id = template_id_param AND status = 'active';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not active';
  END IF;
  
  -- Loop through date range
  current_date := start_date_param;
  WHILE current_date <= end_date_param LOOP
    day_of_week := EXTRACT(DOW FROM current_date);
    
    -- Check if this day should have a shift
    IF day_of_week = ANY(template_record.days_of_week) THEN
      -- Check if instance already exists
      IF NOT EXISTS (
        SELECT 1 FROM public.shift_instances 
        WHERE template_id = template_id_param AND shift_date = current_date
      ) THEN
        -- Insert new shift instance
        INSERT INTO public.shift_instances (
          template_id, shift_date, start_time, end_time, 
          headcount_needed, role_name, color_code, status
        ) VALUES (
          template_id_param, current_date, template_record.start_time, 
          template_record.end_time, template_record.headcount,
          template_record.role_name, template_record.color_code, 'open'::assignment_status
        );
        instances_created := instances_created + 1;
      END IF;
    END IF;
    
    current_date := current_date + INTERVAL '1 day';
  END LOOP;
  
  RETURN instances_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get available staff for a shift
CREATE OR REPLACE FUNCTION public.get_shift_candidates(
  shift_instance_id_param UUID
) RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  score NUMERIC,
  reasons TEXT[]
) AS $$
DECLARE
  shift_record RECORD;
BEGIN
  -- Get shift details
  SELECT si.*, st.* INTO shift_record
  FROM public.shift_instances si
  JOIN public.shift_templates st ON si.template_id = st.id
  WHERE si.id = shift_instance_id_param;
  
  RETURN QUERY
  SELECT 
    cu.auth_user_id,
    cu.name,
    1.0::NUMERIC as score, -- Simple scoring for now
    ARRAY['Available']::TEXT[] as reasons
  FROM public.comprehensive_users cu
  WHERE cu.status = 'Active' 
    AND cu.is_staff_member = true
    -- Add more complex availability logic here
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Insert default scheduler settings
INSERT INTO public.scheduler_settings (setting_key, setting_value, description, updated_by) VALUES
('service_hours', '{"start": "09:00", "end": "17:00"}', 'Default service hours', '00000000-0000-0000-0000-000000000000'),
('weekly_hour_cap', '40', 'Maximum hours per person per week', '00000000-0000-0000-0000-000000000000'),
('auto_assign_delay', '15', 'Minutes to wait before auto-assigning open shifts', '00000000-0000-0000-0000-000000000000'),
('shift_blocks', '[{"name": "Early", "start": "09:00", "end": "14:00", "color": "#10b981"}, {"name": "Supervisor", "start": "10:00", "end": "15:00", "color": "#8b5cf6"}, {"name": "Late", "start": "12:00", "end": "17:00", "color": "#3b82f6"}]', 'Predefined shift blocks', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (setting_key) DO NOTHING;