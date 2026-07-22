INSERT INTO public.billing_settings (vat_rate, default_package, default_call_rate)
SELECT 0.20, 'Standard Package', 1.40
WHERE NOT EXISTS (SELECT 1 FROM public.billing_settings);