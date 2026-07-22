UPDATE auth.users
SET encrypted_password = crypt('26678*+Kat3', gen_salt('bf')),
    updated_at = now()
WHERE id = '2ce7ac0b-34a3-456a-93d3-f1ddeaa70010';