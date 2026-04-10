import { supabase } from '@/integrations/supabase/client';

/**
 * After a quote form submission, attempt to upsert a client profile,
 * auto-generate a portal token, and create/link a property.
 * 
 * This is best-effort — failures here should NOT block the quote submission.
 */
export async function linkClientAndProperty({
  firstName,
  lastName,
  phone,
  email,
  address,
  propertyType,
  bedrooms,
  bathrooms,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
}) {
  try {
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const normalizedPhone = phone.replace(/\s/g, '');
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check if a profile with this phone or email already exists (client role)
    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('id, email, phone')
      .or(`email.ilike.${normalizedEmail},phone.eq.${normalizedPhone}`);

    let clientId: string | null = null;

    if (existingProfiles && existingProfiles.length > 0) {
      // Find one that has client role
      for (const p of existingProfiles) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', p.id)
          .eq('role', 'client')
          .maybeSingle();
        if (roleData) {
          clientId = p.id;
          break;
        }
      }
      // Even without client role, use the first match
      if (!clientId) {
        clientId = existingProfiles[0].id;
      }
    }

    // 2. If no existing client found, we can't create an auth user from the client side.
    //    The admin will handle client creation when reviewing the quote.
    //    But we can still create/link the property.

    // 3. Create property if address is provided and doesn't already exist
    if (address.trim()) {
      const { data: existingProps } = await supabase
        .from('properties')
        .select('id')
        .ilike('address', address.trim())
        .limit(1);

      let propertyId: string | null = existingProps?.[0]?.id || null;

      if (!propertyId) {
        // Create the property
        const { data: newProp } = await supabase
          .from('properties')
          .insert({
            property_name: address.trim(),
            address: address.trim(),
            property_type: propertyType || 'residential',
            bedrooms: bedrooms || 1,
            bathrooms: bathrooms || 1,
            client_name: fullName,
            billing_email: normalizedEmail,
            client_phone: normalizedPhone,
            client_type: 'residential',
          } as any)
          .select('id')
          .single();

        propertyId = newProp?.id || null;
      }

      // 4. Link property to client if both exist
      if (clientId && propertyId) {
        const { data: existingLink } = await supabase
          .from('client_properties')
          .select('id')
          .eq('client_id', clientId)
          .eq('property_id', propertyId)
          .maybeSingle();

        if (!existingLink) {
          await supabase.from('client_properties').insert({
            client_id: clientId,
            property_id: propertyId,
          });
        }
      }

      // 5. Auto-generate portal token if client exists
      if (clientId) {
        const { data: existingToken } = await supabase
          .from('client_tokens')
          .select('id')
          .ilike('email', normalizedEmail)
          .limit(1);

        if (!existingToken || existingToken.length === 0) {
          await supabase.from('client_tokens').insert({
            email: normalizedEmail,
            token: crypto.randomUUID(),
            expires_at: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
            used: false,
          });
        }
      }
    }
  } catch (err) {
    // Best-effort — don't block the quote submission
    console.warn('linkClientAndProperty failed (non-critical):', err);
  }
}
