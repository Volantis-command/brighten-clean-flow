// Shared by every function that raises a Xero invoice, so they all agree on
// who gets billed and what the invoice is numbered.

/**
 * The next invoice number, INV-1057 style. One database sequence feeds every
 * invoice path (per clean, the invoice buttons, the Monday weekly run), so
 * numbers never repeat and never come in two styles again.
 */
export async function nextInvoiceNumber(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc('next_invoice_number');
  if (error || !data) throw new Error(`Could not get the next invoice number: ${error?.message || 'no number returned'}`);
  return String(data);
}

/** Xero refuses a number it has already used (e.g. one typed into Xero by hand). */
export function isDuplicateInvoiceNumber(status: number, body: string): boolean {
  return status === 400 && /unique|already (been )?used|already exists/i.test(body);
}

/**
 * Who pays for a property: the linked client's invoice name (or client name)
 * and whether they're on weekly invoicing.
 *
 * Two plain lookups on purpose. client_properties.client_id has no foreign key
 * to profiles, so the embedded `profiles:client_id(...)` select these functions
 * used before always came back empty: weekly clients were invoiced per clean
 * and the client name was never used.
 */
export async function billingClient(
  supabase: any,
  propertyId: string | null | undefined,
): Promise<{ id: string; name: string | null; email: string | null; weekly: boolean } | null> {
  if (!propertyId) return null;
  const { data: link, error: linkError } = await supabase
    .from('client_properties')
    .select('client_id')
    .eq('property_id', propertyId)
    .not('client_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (linkError) throw new Error(`Could not look up the client for this property: ${linkError.message}`);
  if (!link?.client_id) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, invoice_name, email, weekly_invoice')
    .eq('id', link.client_id)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load the client for this property: ${profileError.message}`);
  if (!profile) return null;

  return {
    id: profile.id,
    name: profile.invoice_name?.trim() || profile.full_name?.trim() || null,
    email: profile.email || null,
    weekly: profile.weekly_invoice === true,
  };
}
