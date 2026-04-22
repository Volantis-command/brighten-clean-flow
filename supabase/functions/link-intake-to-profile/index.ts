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
  //
  // access_code: the lockbox/keypad CODE (what the intake form calls
  // "access_instructions" — e.g. "1234"). Lands on property.access_code
  // which is what the Profile tab's "Key Safe / Lockbox Code" surface reads.
  access_method?: string | null;
  access_code?: string | null;
  access_notes?: string | null;
  parking_instructions?: string | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  host_preferences?: string | null;
  // Full intake-form passthrough (added 2026-04-22 — Option B)
  clean_frequency?: string | null;
  preferred_days?: string | null;
  preferred_time?: string | null;
  pet_notes?: string | null;
  first_clean?: boolean | null;
  focus_areas?: string | null;
  bed_config?: string | null;
  sofa_beds?: number | null;
  kitchens?: number | null;
  living_areas?: number | null;
  balconies?: number | null;
  has_outdoor_area?: boolean | null;
  linen_required?: boolean | null;
  amenities_kit?: boolean | null;
  wash_kit?: boolean | null;
  tea_coffee_kit?: boolean | null;
  platform?: string | null;
  // Second pass (2026-04-22) — rest of the fields captured by intake
  toilets?: number | null;
  has_garage?: boolean | null;
  property_photos?: Array<{ url: string; label?: string }> | null;
  // Deep clean specific
  deep_clean_oven?: boolean | null;
  deep_clean_fridge?: boolean | null;
  deep_clean_cupboards?: boolean | null;
  deep_clean_windows?: boolean | null;
  last_cleaned_when?: string | null;
  property_condition?: string | null;
  // Commercial specific
  business_name?: string | null;
  abn?: string | null;
  approx_size?: string | null;
  has_kitchen_breakroom?: boolean | null;
  floor_types?: string | null;
  after_hours_access?: boolean | null;
  has_security_alarm?: boolean | null;
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
    const STAFF_ROLES = ['admin', 'cleaner', 'head_cleaner'];
    const normalizePhone = (value?: string | null) => (value || '').replace(/\D/g, '');
    const getRoleSet = async (userId: string) => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      return new Set((roles || []).map((r: any) => r.role));
    };

    // ── 1. Find or create client profile ──────────────────────────────────
    let clientProfileId: string | null = null;

    if (body.email) {
      const { data: emailMatches } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('email', body.email);

      for (const profile of emailMatches || []) {
        const roleSet = await getRoleSet(profile.id);
        const hasStaffRole = STAFF_ROLES.some((role) => roleSet.has(role));
        if (hasStaffRole) {
          return new Response(JSON.stringify({
            error: 'This email already belongs to a staff account. Use a different email for the client account.',
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (roleSet.has('client')) {
          clientProfileId = profile.id;
          break;
        }
      }
    }

    if (!clientProfileId && body.phone) {
      const phoneDigits = normalizePhone(body.phone);
      const { data: phoneMatches } = await supabase
        .from('profiles')
        .select('id, phone')
        .not('phone', 'is', null);

      for (const profile of phoneMatches || []) {
        if (normalizePhone((profile as any).phone) !== phoneDigits) continue;
        const roleSet = await getRoleSet(profile.id);
        const hasStaffRole = STAFF_ROLES.some((role) => roleSet.has(role));
        if (hasStaffRole) continue;
        if (roleSet.has('client')) {
          clientProfileId = profile.id;
          break;
        }
      }
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
          access_code: body.access_code || null,
          access_notes: body.access_notes || null,
          parking_instructions: body.parking_instructions || null,
          checkin_time: body.checkin_time || null,
          checkout_time: body.checkout_time || null,
          host_preferences: body.host_preferences || null,
          // Full intake passthrough — Option B, all on properties, one truth.
          clean_frequency: body.clean_frequency || null,
          preferred_days: body.preferred_days || null,
          preferred_time: body.preferred_time || null,
          pet_notes: body.pet_notes || null,
          first_clean: body.first_clean ?? null,
          focus_areas: body.focus_areas || null,
          bed_config: body.bed_config || null,
          sofa_beds: body.sofa_beds ?? null,
          kitchens: body.kitchens ?? null,
          living_areas: body.living_areas ?? null,
          balconies: body.balconies ?? null,
          has_outdoor_area: body.has_outdoor_area ?? null,
          linen_required: body.linen_required ?? null,
          amenities_kit: body.amenities_kit ?? null,
          wash_kit: body.wash_kit ?? null,
          tea_coffee_kit: body.tea_coffee_kit ?? null,
          platform: body.platform || null,
          // Second pass — rest of intake fields
          toilets: body.toilets ?? null,
          has_garage: body.has_garage ?? null,
          property_photos: body.property_photos && body.property_photos.length > 0 ? body.property_photos : null,
          deep_clean_oven: body.deep_clean_oven ?? null,
          deep_clean_fridge: body.deep_clean_fridge ?? null,
          deep_clean_cupboards: body.deep_clean_cupboards ?? null,
          deep_clean_windows: body.deep_clean_windows ?? null,
          last_cleaned_when: body.last_cleaned_when || null,
          property_condition: body.property_condition || null,
          business_name: body.business_name || null,
          abn: body.abn || null,
          approx_size: body.approx_size || null,
          has_kitchen_breakroom: body.has_kitchen_breakroom ?? null,
          floor_types: body.floor_types || null,
          after_hours_access: body.after_hours_access ?? null,
          has_security_alarm: body.has_security_alarm ?? null,
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
