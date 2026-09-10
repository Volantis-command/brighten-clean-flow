import { supabase } from '@/integrations/supabase/client';

/**
 * Remove a client and everything hanging off them.
 *
 * Lives here rather than inside ClientsPage so the Clients list and the client
 * detail page delete identically. Two implementations of a destructive action
 * is how they drift, and only one of them ends up with the safety checks.
 */

export type DeletableClient = {
  id: string;
  linked_properties?: { property_id: string }[];
};

/**
 * Refuse to delete anyone holding a staff role.
 *
 * The Clients list hides the signed-in user, but nothing stopped a second
 * admin or a cleaner who also appears as a client from being wiped, which
 * would take their login with it. This is a hard stop, not a warning.
 */
async function assertNotStaff(userId: string) {
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  if (error) throw new Error(`Could not check this account's roles: ${error.message}`);

  const held = (roles || []).map((r: any) => r.role);
  const staffRole = held.find((r: string) => ['admin', 'head_cleaner', 'cleaner'].includes(r));
  if (staffRole) {
    throw new Error(
      `This account is a ${staffRole.replace('_', ' ')}, not just a client, so it cannot be deleted here. ` +
      `Remove them from Staff if that is really what you want.`,
    );
  }
}

export async function deleteClient(c: DeletableClient): Promise<void> {
  const isRealUser = !c.id.startsWith('property-') && !c.id.startsWith('qr-');

  // Pseudo-clients come from two places (see useClientsList in ClientsPage):
  //   property-<propId>  a property row carrying client details but no profile
  //   qr-<quoteRequestId> an accepted lead that never became a profile
  if (!isRealUser) {
    if (c.id.startsWith('property-')) {
      for (const lp of c.linked_properties || []) {
        const { error } = await supabase
          .from('properties')
          .update({ client_name: null, billing_email: null, client_phone: null })
          .eq('id', lp.property_id);
        if (error) throw new Error(`Failed to clear property client info: ${error.message}`);
      }
      return;
    }

    if (c.id.startsWith('qr-')) {
      const qrId = c.id.replace(/^qr-/, '');
      const { error } = await supabase.from('quote_requests').delete().eq('id', qrId);
      if (error) throw new Error(`Failed to delete lead: ${error.message}`);
      return;
    }

    // Unknown format. Fail loudly rather than reporting a success that did nothing.
    throw new Error(`Cannot delete: unrecognised client record (${c.id})`);
  }

  await assertNotStaff(c.id);

  const clientId = c.id;

  const { error: cpErr } = await supabase.from('client_properties').delete().eq('client_id', clientId);
  if (cpErr) throw new Error(`Failed to remove property links: ${cpErr.message}`);

  await supabase.from('client_comms').delete().eq('client_id', clientId);
  await supabase.from('client_messages').delete().eq('client_id', clientId);
  await supabase.from('clean_requests').delete().eq('client_id', clientId);
  await supabase.from('job_feedback').delete().eq('client_id', clientId);
  await supabase.from('notifications').delete().eq('user_id', clientId);
  await supabase.from('user_roles').delete().eq('user_id', clientId);

  const { error: profileErr } = await supabase.from('profiles').delete().eq('id', clientId);
  if (profileErr) throw new Error(`Failed to delete client profile: ${profileErr.message}`);
}
