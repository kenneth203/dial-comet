-- Fix security warnings detected by the linter

-- 1. Fix search_path for masking functions by adding SECURITY DEFINER and proper search_path
CREATE OR REPLACE FUNCTION public.mask_phone_number(phone TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE 
        WHEN phone IS NULL OR LENGTH(phone) < 4 THEN phone
        ELSE SUBSTRING(phone FROM 1 FOR 3) || '***' || RIGHT(phone, 2)
    END;
$$;

CREATE OR REPLACE FUNCTION public.mask_email(email TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE  
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE 
        WHEN email IS NULL OR POSITION('@' IN email) = 0 THEN email
        ELSE LEFT(email, 2) || '***@' || SPLIT_PART(email, '@', 2)
    END;
$$;

CREATE OR REPLACE FUNCTION public.mask_address(address TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE 
        WHEN address IS NULL OR LENGTH(address) < 10 THEN address
        ELSE LEFT(address, 10) || '...[REDACTED]'
    END;
$$;