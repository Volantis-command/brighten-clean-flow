
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
