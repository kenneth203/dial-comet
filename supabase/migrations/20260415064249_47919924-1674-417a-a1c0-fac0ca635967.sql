
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS assignee_id text,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
