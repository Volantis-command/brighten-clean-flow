// Creates / reuses a client profile and a property record, and links them
// together the moment an intake form is submitted.
//
// Why: previously the client profile + property + client_properties link were
// only created when admin accepted the quote (ScheduleAfterAcceptModal). That
// meant if a customer filled out the intake form, logged into the client
// portal to check on their request, they'd see zero properties — because the
// property only came into existence at quote-acceptance time.
//
// This function runs server-side with the service role key so that anonymous
// form submissions can create profiles / properties / links that RLS would
// normally block. Idempotent: repeated calls with the same phone/email/address
// reuse existing records.
//
// Called from: src/components/quote-intake/ResidentialForm.tsx,
//              src/components/quote-intake/CommercialForm.tsx
// Also marked verify_jwt = false in supabase/config.toml.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  property_address: string;
  property_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  clean_type?: string | null;
  // Property-detail passthrough added 2026-04-22 so Airbnb and Residential
  // intake data flows through to the property record (not just captured in
  // quote_requests.form_data). Previously these fields landed on the lead
  // but never reached the Property Passport tab, so admin saw an empty shell.
  access_method?: string | null;
  access_notes?: string | null;
  parking_instructions?: string | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  host_preferences?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;

    if (!body.property_address) {
      return new Response(JSON.stringify({ error: 'property_address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!body.phone && !body.email) {
      return new Response(JSON.stringify({ error: 'phone or email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const fullName = body.full_name ||
      [body.first_name, body.last_name].filter(Boolean).join(' ').trim() ||
      null;

    // ── 1. Find or create client profile ──────────────────────────────────
    let clientProfileId: string | null = null;

    if (body.phone) {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', body.phone)
        .maybeSingle();
      if (data) clientProfileId = data.id;
    }
    if (!clientProfileId && body.email) {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', body.email)
        .maybeSingle();
      if (data) clientProfileId = data.id;
    }

    if (clientProfileId) {
      // Update existing profile with any newer info (non-destructive)
      await supabase
        .from('profiles')
        .update({
          full_name: fullName || undefined,
          phone: body.phone || undefined,
          email: body.email || undefined,
        } as any)
        .eq('id', clientProfileId);
    } else {
      // profiles.id is a FK to auth.users — we can't just INSERT into profiles
      // without a matching auth user. Use the admin API to create an auth user
      // first; Supabase's on-signup trigger then creates the profiles row.
      // Generate a random password (client never sees it — they use the SMS
      // magic-link portal).
      const randomPassword = crypto.randomUUID() + '!Aa1'; // meets pw complexity

      // Try email first, fall back to phone-based pseudo-email
      const authEmail = body.email || `${(body.phone || '').replace(/\D/g, '')}@client.brightly.cleaning`;

      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: randomPassword,
        email_confirm: true, // skip confirmation email
        phone: body.phone || undefined,
        user_metadata: { full_name: fullName, role: 'client' },
      });
      if (authErr) throw new Error(`auth createUser: ${authErr.message}`);
      clientProfileId = authUser.user.id;

      // The on-signup trigger creates a basic profile — update it with full data
      await supabase.from('profiles').update({
        full_name: fullName,
        phone: body.phone || null,
        email: body.email || null,
      } as any).eq('id', clientProfileId);

      // Give them the client role (needed for client portal login + RLS policies)
      await supabase.from('user_roles').insert({
        user_id: clientProfileId,
        role: 'client',
      } as any);
    }

    // ── 2. Find or create the property ────────────────────────────────────
    // Match on address + already-linked-to-this-client to avoid false dedup
    // (two different clients might have similar test addresses).
    let propertyId: string | null = null;

    const { data: linkedProps } = await supabase
      .from('client_properties')
      .select('property_id, properties(address)')
      .eq('client_id', clientProfileId);

    const match = (linkedProps || []).find((lp: any) =>
      lp.properties?.address?.trim().toLowerCase() === body.property_address.trim().toLowerCase()
    );
    if (match) propertyId = match.property_id;

    if (!propertyId) {
      const propertyName = fullName
        ? `${fullName.split(' ')[0]}'s Property`
        : body.property_address;

      const { data: newProp, error: propErr } = await supabase
        .from('properties')
        .insert({
          property_name: propertyName,
          address: body.property_address,
          client_name: fullName,
          client_phone: body.phone || null,
          billing_email: body.email || null,
          bedrooms: body.bedrooms || null,
          bathrooms: body.bathrooms || null,
          client_type: body.clean_type?.toLowerCase().includes('airbnb') ? 'airbnb' : 'residential',
          status: 'onboarding',
          // Property-detail passthrough (2026-04-22). All nullable — if the
          // intake form didn't collect the field we just leave it null.
          access_method: body.access_method || null,
          access_notes: body.access_notes || null,
          parking_instructions: body.parking_instructions || null,
          checkin_time: body.checkin_time || null,
          checkout_time: body.checkout_time || null,
          host_preferences: body.host_preferences || null,
        } as any)
        .select('id')
        .single();
      if (propErr) throw new Error(`property insert: ${propErr.message}`);
      propertyId = newProp.id;

      // Link client ↔ property
      const { error: linkErr } = await supabase.from('client_properties').insert({
        client_id: clientProfileId,
        property_id: propertyId,
      } as any);
      if (linkErr) throw new Error(`client_properties link: ${linkErr.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_profile_id: clientProfileId,
        property_id: propertyId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('link-intake-to-profile error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
