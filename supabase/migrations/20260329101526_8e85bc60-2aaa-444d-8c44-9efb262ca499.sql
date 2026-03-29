-- Fix user roles: change clients incorrectly assigned as admin to client role
UPDATE public.user_roles 
SET role = 'client' 
WHERE user_id IN ('49c58c52-da55-4dfe-b66a-2e8fc7b5c5f0', '306d2130-a952-4781-8ea8-6d2affa1180b') 
AND role = 'admin';

-- Fix profile full_name for the Chantee'a House user (property name was stored as person's name)
UPDATE public.profiles 
SET full_name = 'Chantee' 
WHERE id = '49c58c52-da55-4dfe-b66a-2e8fc7b5c5f0' 
AND full_name = 'Chantee''a House';

-- Clear cleaner assignments where a client was incorrectly assigned as cleaner
UPDATE public.jobs 
SET cleaner_1_id = NULL 
WHERE cleaner_1_id = '49c58c52-da55-4dfe-b66a-2e8fc7b5c5f0';

UPDATE public.jobs 
SET cleaner_2_id = NULL 
WHERE cleaner_2_id = '49c58c52-da55-4dfe-b66a-2e8fc7b5c5f0';

UPDATE public.jobs 
SET cleaner_1_id = NULL 
WHERE cleaner_1_id = '306d2130-a952-4781-8ea8-6d2affa1180b';

UPDATE public.jobs 
SET cleaner_2_id = NULL 
WHERE cleaner_2_id = '306d2130-a952-4781-8ea8-6d2affa1180b';