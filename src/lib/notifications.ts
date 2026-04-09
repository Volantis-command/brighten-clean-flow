import { supabase } from '@/integrations/supabase/client';
import { createAlert, createAlertForUser } from './alerts';

interface CreateNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * @deprecated Use createAlert() from '@/lib/alerts' instead.
 */
export async function createAdminNotification(params: Omit<CreateNotification, 'userId'>) {
  await createAlert({
    event_type: params.type,
    title: params.title,
    body: params.message,
    link: params.link,
  });
}

/**
 * @deprecated Use createAlertForUser() from '@/lib/alerts' instead.
 */
export async function createNotification(params: CreateNotification) {
  await createAlertForUser(params.userId, {
    event_type: params.type,
    title: params.title,
    body: params.message,
    link: params.link,
  });
}
