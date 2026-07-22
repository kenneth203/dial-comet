UPDATE public.customers
SET billing_status = '["Active"]'::jsonb,
    services = '["Call Answering Service"]'::jsonb,
    updated_at = now()
WHERE id = 'e481156f-a733-46ec-84c4-0ab39319f8c4';

DELETE FROM public.customers
WHERE id = 'b7d81d54-c156-4a7f-9c48-9eaac27bf3bc';