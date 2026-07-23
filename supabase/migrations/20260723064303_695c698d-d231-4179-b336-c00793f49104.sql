INSERT INTO public.profiles (user_id, name, role, status)
VALUES ('7b95a493-dbf3-4e3b-8e37-2072cf315be5', 'Kenneth', 'Super-Admin', 'Active')
ON CONFLICT (user_id) DO UPDATE SET role='Super-Admin', status='Active';

INSERT INTO public.system_users (user_id, name, email, role, status)
VALUES ('7b95a493-dbf3-4e3b-8e37-2072cf315be5', 'Kenneth', 'kenneth@thevateam.co.uk', 'Super-Admin', 'Active')
ON CONFLICT (user_id) DO UPDATE SET role='Super-Admin', status='Active';