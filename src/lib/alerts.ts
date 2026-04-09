import { supabase } from '@/integrations/supabase/client';

interface CreateAlertParams {
  event_type: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  target_role?: string;
  actor_id?: string;
  link?: string;
}

/**
 * Single entry point for creating tiered alerts.
 * Looks up tier from alert_tiers config, respects enabled flag.
 * Inserts notification rows for all users matching target_role (defaults to 'admin').
 */
export async function createAlert(params: CreateAlertParams) {
  const { event_type, title, body, metadata, target_role = 'admin', actor_id, link } = params;

  // Look up tier config
  const { data: tierConfig } = await supabase
    .from('alert_tiers' as any)
    .select('tier, enabled')
    .eq('event_type', event_type)
    .maybeSingle();

  const tier = (tierConfig as any)?.tier || 'info';
  const enabled = (tierConfig as any)?.enabled !== false; // default true if not found

  if (!enabled) return;

  // Get target user IDs
  const role = target_role || 'admin';
  const { data: roleUsers } = await (supabase
    .from('user_roles') as any)
    .select('user_id')
    .eq('role', role);

  if (!roleUsers?.length) return;

  const rows = roleUsers.map((u) => ({
    user_id: u.user_id,
    title,
    message: body,
    type: event_type,
    tier,
    event_type,
    metadata: metadata || null,
    actor_id: actor_id || null,
    target_role: role,
    link: link || null,
    read: false,
  }));

  await supabase.from('notifications').insert(rows as any);
}

/**
 * Create alert for a specific user (not role-based).
 */
export async function createAlertForUser(userId: string, params: Omit<CreateAlertParams, 'target_role'>) {
  const { event_type, title, body, metadata, actor_id, link } = params;

  const { data: tierConfig } = await supabase
    .from('alert_tiers' as any)
    .select('tier, enabled')
    .eq('event_type', event_type)
    .maybeSingle();

  const tier = (tierConfig as any)?.tier || 'info';
  const enabled = (tierConfig as any)?.enabled !== false;
  if (!enabled) return;

  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message: body,
    type: event_type,
    tier,
    event_type,
    metadata: metadata || null,
    actor_id: actor_id || null,
    link: link || null,
    read: false,
  } as any);
}
