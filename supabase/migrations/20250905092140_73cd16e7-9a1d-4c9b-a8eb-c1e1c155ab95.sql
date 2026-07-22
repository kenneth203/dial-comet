-- Fix security linter warnings for shift scheduler functions

-- Fix audit trigger function
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

-- Fix update timestamp function  
CREATE OR REPLACE FUNCTION public.update_shift_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;