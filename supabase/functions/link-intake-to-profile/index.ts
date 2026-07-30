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
  bed_types?: Record<string, string> | null; // per-bedroom map: { "0": "King", "1": "Queen" }
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

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, function: 'link-intake-to-profile' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const raw = await req.text();
    if (!raw) {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = JSON.parse(raw) as Body;

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

      // Try the supplied email first, but only if it looks like a real
      // email. Bad emails (just "jade", "n/a", missing @, etc) used to
      // cascade-fail the whole accept flow; now we transparently fall
      // back to the phone-based pseudo-email and keep going. The real
      // email can be edited on the property/profile later.
      const looksLikeEmail = (s: string | null | undefined): boolean =>
        !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
      const phoneDigits = (body.phone || '').replace(/\D/g, '');
      const phonePseudoEmail = phoneDigits ? `${phoneDigits}@client.brightly.cleaning` : null;
      const authEmail = looksLikeEmail(body.email) ? body.email!.trim() : phonePseudoEmail;

      if (!authEmail) {
        throw new Error('Cannot create client account: need a valid email OR a phone number.');
      }

      let { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: randomPassword,
        email_confirm: true, // skip confirmation email
        user_metadata: { full_name: fullName, role: 'client' },
      });

      // If createUser failed because the chosen email was already taken
      // (e.g. they retried after a previous attempt), retry once with the
      // phone pseudo-email so the flow doesn't dead-end.
      if (authErr && /already registered|already been registered|duplicate/i.test(authErr.message) && authEmail !== phonePseudoEmail && phonePseudoEmail) {
        const retry = await supabase.auth.admin.createUser({
          email: phonePseudoEmail,
          password: randomPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: 'client' },
        });
        authUser = retry.data;
        authErr = retry.error;
      }

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
    if (match) {
      propertyId = match.property_id;

      // Non-destructive fill: when an admin manually adds a client and SMSes
      // them the intake link ("Send Onboarding Form" button), the same form
      // returns through here. Without this block, every field the client
      // typed would be silently discarded — the match-and-return above means
      // we already have a property linked, so the original code just bailed.
      //
      // Rule: ONLY fill columns where the existing value is null or empty.
      // Anything an admin (or earlier submission) typed wins. This preserves
      // the data-safety contract: never overwrite client data we already
      // have, in case a re-submit has typos or blanks.
      try {
        const { data: existing } = await supabase
          .from('properties')
          .select(
            'access_method, access_code, access_notes, parking_instructions, ' +
            'checkin_time, checkout_time, host_preferences, clean_frequency, ' +
            'preferred_days, preferred_time, pet_notes, first_clean, focus_areas, ' +
            'bed_config, bed_types, sofa_beds, kitchens, living_areas, balconies, ' +
            'has_outdoor_area, linen_required, amenities_kit, wash_kit, ' +
            'tea_coffee_kit, platform, toilets, has_garage, property_photos, ' +
            'deep_clean_oven, deep_clean_fridge, deep_clean_cupboards, ' +
            'deep_clean_windows, last_cleaned_when, property_condition, ' +
            'business_name, abn, approx_size, has_kitchen_breakroom, ' +
            'floor_types, after_hours_access, has_security_alarm, bedrooms, ' +
            'bathrooms, status'
          )
          .eq('id', propertyId)
          .single();

        if (existing) {
          // For each candidate field: fill only if existing is empty AND body has a value.
          const isEmpty = (v: unknown): boolean =>
            v === null || v === undefined || v === '' ||
            (Array.isArray(v) && v.length === 0);

          const candidates: Record<string, unknown> = {
            access_method: body.access_method,
            access_code: body.access_code,
            access_notes: body.access_notes,
            parking_instructions: body.parking_instructions,
            checkin_time: body.checkin_time,
            checkout_time: body.checkout_time,
            host_preferences: body.host_preferences,
            clean_frequency: body.clean_frequency,
            preferred_days: body.preferred_days,
            preferred_time: body.preferred_time,
            pet_notes: body.pet_notes,
            first_clean: body.first_clean,
            focus_areas: body.focus_areas,
            bed_config: body.bed_config,
            bed_types: body.bed_types,
            sofa_beds: body.sofa_beds,
            kitchens: body.kitchens,
            living_areas: body.living_areas,
            balconies: body.balconies,
            has_outdoor_area: body.has_outdoor_area,
            linen_required: body.linen_required,
            amenities_kit: body.amenities_kit,
            wash_kit: body.wash_kit,
            tea_coffee_kit: body.tea_coffee_kit,
            platform: body.platform,
            toilets: body.toilets,
            has_garage: body.has_garage,
            property_photos: body.property_photos,
            deep_clean_oven: body.deep_clean_oven,
            deep_clean_fridge: body.deep_clean_fridge,
            deep_clean_cupboards: body.deep_clean_cupboards,
            deep_clean_windows: body.deep_clean_windows,
            last_cleaned_when: body.last_cleaned_when,
            property_condition: body.property_condition,
            business_name: body.business_name,
            abn: body.abn,
            approx_size: body.approx_size,
            has_kitchen_breakroom: body.has_kitchen_breakroom,
            floor_types: body.floor_types,
            after_hours_access: body.after_hours_access,
            has_security_alarm: body.has_security_alarm,
            bedrooms: body.bedrooms,
            bathrooms: body.bathrooms,
          };

          const fillPayload: Record<string, unknown> = {};
          for (const [key, newValue] of Object.entries(candidates)) {
            if (!isEmpty(newValue) && isEmpty((existing as any)[key])) {
              fillPayload[key] = newValue;
            }
          }

          // Flip a placeholder property out of 'onboarding' once the client
          // has actually submitted — but never demote an already-active row.
          if ((existing as any).status === 'onboarding') {
            fillPayload.status = 'active';
          }

          if (Object.keys(fillPayload).length > 0) {
            await supabase
              .from('properties')
              .update(fillPayload as any)
              .eq('id', propertyId);
          }
        }

        // Mark the onboarding-form loop closed for this client+property so
        // the admin's Onboarding Status panel flips to "✓ Submitted".
        await supabase
          .from('client_properties')
          .update({ onboard_used: true } as any)
          .eq('client_id', clientProfileId)
          .eq('property_id', propertyId);
      } catch (e) {
        // Defensive: if anything in the fill/flip path fails, log and fall
        // through. We must not break the public intake submission because
        // of a best-effort enrichment step.
        console.error('non-destructive property fill failed:', e);
      }
    }

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
          bed_types: body.bed_types || null,
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

    // Residential auto-book: create the clean at the client's chosen slot so it
    // lands in the schedule as a new job needing a cleaner. Airbnb never sends
    // create_job — its dates track guest checkouts, so the admin coordinates it.
    let jobId: string | null = null;
    if (body.create_job && propertyId && body.scheduled_date) {
      const { data: job, error: jobErr } = await supabase.from('jobs').insert({
        property_id: propertyId,
        scheduled_date: body.scheduled_date,
        scheduled_time: body.scheduled_time || null,
        status: 'pending_cleaner',
        source: 'instant_quote',
        frequency: 'one-off',
        client_name: fullName,
        price_inc_gst: body.price_inc_gst ?? null,
        price_ex_gst: body.price_ex_gst ?? null,
        estimated_duration: body.estimated_hours != null ? Math.round(Number(body.estimated_hours) * 60) : null,
      } as any).select('id').single();
      if (jobErr) {
        // Surface the real reason so approval isn't a silent no-op.
        console.error('auto-book job insert failed:', jobErr.message);
        return new Response(
          JSON.stringify({ success: false, error: `Job insert failed: ${jobErr.message}`, client_profile_id: clientProfileId, property_id: propertyId, job_id: null }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      jobId = job?.id ?? null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_profile_id: clientProfileId,
        property_id: propertyId,
        job_id: jobId,
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
