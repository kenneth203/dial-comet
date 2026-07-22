-- Fix OTP expiry security warning
-- Reduce OTP expiry time from default to more secure 5 minutes

UPDATE auth.config 
SET value = '300'  -- 5 minutes in seconds (was 3600 = 60 minutes)
WHERE parameter = 'OTP_EXPIRY';