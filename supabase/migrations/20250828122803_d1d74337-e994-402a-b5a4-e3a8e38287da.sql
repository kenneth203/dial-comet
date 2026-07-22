-- Update existing staff records to populate the name field from profiles where available
UPDATE public.staff_details 
SET name = p.name 
FROM public.profiles p 
WHERE staff_details.user_id = p.user_id 
AND staff_details.name IS NULL;

-- For staff records without a profile, set a placeholder that can be updated
UPDATE public.staff_details 
SET name = 'Unknown' 
WHERE name IS NULL;