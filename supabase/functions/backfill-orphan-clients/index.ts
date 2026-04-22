// One-shot admin tool: turn orphan quote_requests into proper clients.
//
// Context: the /clients page falls back to showing quote_requests when there's
// no matching profile. Historically many leads were captured but never got a
// profile / property / client_properties link because AirbnbForm didn't call
// link-intake-to-profile (fixed 2026-04-22), and some leads predate even that
// edge function. Result: most clients Brendan sees in admin have "No properties
// yet" because they're just raw quote_request rows.
//
// This function iterates every quote_request that has an address + phone/email
// and no profile-matching by phone/email. For each one it creates the auth
// user, profile, property, and client_properties link — same logic as
// link-intake-to-profile, just batched.
//
// Idempotent: skips leads that already have a matching profile via phone/email.
//
// Call: POST /functions/v1/backfill-orphan-clients
// Admin-only (verify_jwt defaults to true). Response: { processed, created, skipped, errors }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const STAFF_ROLES = ['admin', 'cleaner', 'head_cleaner'];
  const normalizePhone = (value?: string | null) => (value || '').replace(/\D/g, '');
  const getRoleSet = async (userId: string) => {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    return new Set((roles || []).map((r: any) => r.role));
  };

  const report = {
    processed: 0,
    created: 0,
    skipped_existing_profile: 0,
    skipped_no_contact: 0,
    skipped_no_address: 0,
    errors: [] as Array<{ lead_id: string; step: string; message: string }>,
  };

  try {
    // Fetch every lead we might want to onboard. We keep the status filter
    // wide — Brendan wants historic leads turned into clients too.
    const { data: leads, error: leadsErr } = await supabase
      .from('quote_requests')
      .select('id, first_name, last_name, phone, email, address, property_type, bedrooms, bathrooms, clean_type');

    if (leadsErr) throw new Error(`fetch leads: ${leadsErr.message}`);

    for (const lead of leads || []) {
      report.processed++;

      if (!lead.address || !lead.address.trim()) {
        report.skipped_no_address++;
        continue;
      }
      if (!lead.phone && !lead.email) {
        report.skipped_no_contact++;
        continue;
      }

      const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || null;

      // ── Step 1: find or create profile ──
      let clientProfileId: string | null = null;

      if (lead.email) {
        const { data: emailMatches } = await supabase
          .from('profiles')
          .select('id, email')
          .ilike('email', lead.email);
        for (const profile of emailMatches || []) {
          const roleSet = await getRoleSet(profile.id);
          const hasStaffRole = STAFF_ROLES.some((role) => roleSet.has(role));
          if (hasStaffRole) continue;
          if (roleSet.has('client')) {
            clientProfileId = profile.id;
            break;
          }
        }
      }
      if (!clientProfileId && lead.phone) {
        const phoneDigits = normalizePhone(lead.phone);
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

      const profileAlreadyExisted = !!clientProfileId;

      if (!clientProfileId) {
        // Create auth user so profiles FK to auth.users is satisfied.
        const randomPassword = crypto.randomUUID() + '!Aa1';
        const authEmail = lead.email || `${(lead.phone || '').replace(/\D/g, '')}@client.brightly.cleaning`;

        const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
          email: authEmail,
          password: randomPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: 'client' },
        });
        if (authErr) {
          report.errors.push({ lead_id: lead.id, step: 'auth createUser', message: authErr.message });
          continue;
        }
        clientProfileId = authUser.user!.id;

        await supabase.from('profiles').update({
          full_name: fullName,
          phone: lead.phone || null,
          email: lead.email || null,
        } as any).eq('id', clientProfileId);

        await supabase.from('user_roles').insert({
          user_id: clientProfileId,
          role: 'client',
        } as any);
      }

      // ── Step 2: find or create property ──
      let propertyId: string | null = null;

      const { data: linkedProps } = await supabase
        .from('client_properties')
        .select('property_id, properties(address)')
        .eq('client_id', clientProfileId);

      const match = (linkedProps || []).find((lp: any) =>
        lp.properties?.address?.trim().toLowerCase() === lead.address.trim().toLowerCase()
      );
      if (match) propertyId = match.property_id;

      if (!propertyId) {
        const propertyName = fullName
          ? `${fullName.split(' ')[0]}'s Property`
          : lead.address;

        const { data: newProp, error: propErr } = await supabase
          .from('properties')
          .insert({
            property_name: propertyName,
            address: lead.address,
            client_name: fullName,
            client_phone: lead.phone || null,
            billing_email: lead.email || null,
            bedrooms: lead.bedrooms || null,
            bathrooms: lead.bathrooms || null,
            client_type: lead.clean_type?.toLowerCase().includes('airbnb') ? 'airbnb' : 'residential',
            status: 'onboarding',
          } as any)
          .select('id')
          .single();
        if (propErr) {
          report.errors.push({ lead_id: lead.id, step: 'property insert', message: propErr.message });
          continue;
        }
        propertyId = newProp!.id;

        const { error: linkErr } = await supabase.from('client_properties').insert({
          client_id: clientProfileId,
          property_id: propertyId,
        } as any);
        if (linkErr) {
          report.errors.push({ lead_id: lead.id, step: 'client_properties link', message: linkErr.message });
          continue;
        }
      }

      if (profileAlreadyExisted) {
        report.skipped_existing_profile++;
      } else {
        report.created++;
      }
    }

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('backfill-orphan-clients error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error', report }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
