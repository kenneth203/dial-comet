-- Allow NULL template_id for one-off shifts created via Quick Add
ALTER TABLE public.shift_instances 
ALTER COLUMN template_id DROP NOT NULL;