import { supabase } from '@/integrations/supabase/client';

interface CreateNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

export async function createAdminNotification(params: Omit<CreateNotification, 'userId'>) {
  // Get all admin user IDs
  const { data: admins } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');

  if (!admins?.length) return;

  const rows = admins.map((a) => ({
    user_id: a.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link || null,
    read: false,
  }));

  await supabase.from('notifications').insert(rows);
}

export async function createNotification(params: CreateNotification) {
  await supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link || null,
    read: false,
  });
}
