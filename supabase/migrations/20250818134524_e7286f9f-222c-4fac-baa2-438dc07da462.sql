-- Add notes field to todos table for sub-notes
ALTER TABLE public.todos 
ADD COLUMN notes TEXT DEFAULT '';