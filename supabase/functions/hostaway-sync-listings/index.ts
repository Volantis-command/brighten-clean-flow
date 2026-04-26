// Hostaway listings sync — pulls every listing on a client's Hostaway
// account and either:
//   - links it to an existing Brightly property (when properties.hostaway_listing_id
//     already matches), or
//   - creates a new Brightly property tagged with hostaway_listing_id and
//     linked to the client via client_properties.
//
// Per-client connection model: the function reads the access_token from
// hostaway_tokens for the given Brightly client_id, calls Hostaway's
// /listings endpoint server-side (token never leaves Supabase), and
// writes back via the service role.
//
// Idempotent — safe to re-run. Listings already linked to a property are
// skipped (status: 'matched'). Last sync timestamp on hostaway_tokens is
// updated on success.
//
// This is P2 of the Hostaway integration. P3 (webhook receiver →
// auto-create turnover jobs on reservation events) is the next piece.
//
// Hostaway listings endpoint:
//   GET https://api.hostaway.com/v1/listings?limit=...
//   Auth: Authorization: Bearer <access_token>
//   Envelope: { status: 'success', result: [ {id, name, address, ...}, ... ] }
//
// Notable Hostaway listing fields we map:
//   id              -> properties.hostaway_listing_id (text)
//   name            -> properties.property_name
//   address         -> properties.address
//   city            -> properties.suburb
//   state           -> properties.state
//   zipcode         -> properties.postcode
//   bedroomsNumber  -> properties.bedrooms
//   bathroomsNumber -> properties.bathrooms
//   latitude        -> properties.lat
//   longitude       -> properties.lng

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  client_id: string; // Brightly client_id (profiles.id)
}

interface HostawayListing {
  id: number | string;
  name?: string;
  externalListingName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  countryCode?: string;
  bedroomsNumber?: number;
  bathroomsNumber?: number;
  bedsNumber?: number;
  personCapacity?: number;
  latitude?: number;
  longitude?: number;
}

interface ListingResult {
  hostaway_listing_id: string;
  name: string;
  address: string | null;
  status: 'matched' | 'created' | 'error';
  property_id: string | null;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.client_id) {
    return json({ error: 'Missing required field: client_id' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Get the access token for this client
  const { data: tokenRow, error: tokenErr } = await sb
    .from('hostaway_tokens')
    .select('id, access_token, hostaway_account_id')
    .eq('client_id', body.client_id)
    .maybeSingle();

  if (tokenErr) {
    return json({ error: 'Failed to load Hostaway token', detail: tokenErr.message }, 500);
  }
  if (!tokenRow?.access_token) {
    return json({ error: 'Client is not connected to Hostaway' }, 400);
  }

  // 2. Pull listings from Hostaway
  // Hostaway's default page size is 10; bump to 100 to cover most accounts in one call.
  // For accounts with >100 listings, paginate via offset (not yet needed for the 19-property client).
  const listingsResp = await fetch('https://api.hostaway.com/v1/listings?limit=100', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${tokenRow.access_token}`,
      'Cache-Control': 'no-cache',
    },
  });

  if (!listingsResp.ok) {
    const errText = await listingsResp.text();
    return json({
      error: 'Hostaway /listings request failed',
      status: listingsResp.status,
      detail: errText,
    }, 502);
  }

  const listingsBody = await listingsResp.json() as { status?: string; result?: HostawayListing[] };
  const listings = listingsBody.result ?? [];

  if (!Array.isArray(listings)) {
    return json({ error: 'Unexpected Hostaway response shape', detail: listingsBody }, 502);
  }

  // 3. For each listing, match-or-create
  const results: ListingResult[] = [];

  for (const listing of listings) {
    const listingId = String(listing.id ?? '');
    if (!listingId) {
      // Skip listings without an id — defensive, shouldn't happen but log it
      results.push({
        hostaway_listing_id: '',
        name: listing.name ?? '(unnamed)',
        address: listing.address ?? null,
        status: 'error',
        property_id: null,
        error: 'Listing has no id',
      });
      continue;
    }

    const displayName = listing.name ?? listing.externalListingName ?? `Hostaway listing ${listingId}`;
    const address = listing.address ?? null;

    // Match: is there already a property tagged with this hostaway_listing_id
    // AND linked to this client?
    const { data: existing, error: matchErr } = await sb
      .from('properties')
      .select('id, client_properties!inner(client_id)')
      .eq('hostaway_listing_id', listingId)
      .eq('client_properties.client_id', body.client_id)
      .maybeSingle();

    if (matchErr && matchErr.code !== 'PGRST116') {
      results.push({
        hostaway_listing_id: listingId,
        name: displayName,
        address,
        status: 'error',
        property_id: null,
        error: `Match query failed: ${matchErr.message}`,
      });
      continue;
    }

    if (existing?.id) {
      results.push({
        hostaway_listing_id: listingId,
        name: displayName,
        address,
        status: 'matched',
        property_id: existing.id,
      });
      continue;
    }

    // Create new property
    const propertyPayload = {
      hostaway_listing_id: listingId,
      property_name: displayName,
      address,
      suburb: listing.city ?? null,
      state: listing.state ?? null,
      postcode: listing.zipcode ?? null,
      bedrooms: typeof listing.bedroomsNumber === 'number' ? listing.bedroomsNumber : null,
      bathrooms: typeof listing.bathroomsNumber === 'number' ? listing.bathroomsNumber : null,
      lat: typeof listing.latitude === 'number' ? listing.latitude : null,
      lng: typeof listing.longitude === 'number' ? listing.longitude : null,
      client_type: 'airbnb',
      property_type: 'short_stay',
      platform: 'Airbnb',
      status: 'active',
    };

    const { data: newProp, error: insertErr } = await sb
      .from('properties')
      .insert(propertyPayload)
      .select('id')
      .single();

    if (insertErr || !newProp?.id) {
      results.push({
        hostaway_listing_id: listingId,
        name: displayName,
        address,
        status: 'error',
        property_id: null,
        error: `Property insert failed: ${insertErr?.message ?? 'no id returned'}`,
      });
      continue;
    }

    // Link property to client
    const { error: linkErr } = await sb
      .from('client_properties')
      .insert({
        client_id: body.client_id,
        property_id: newProp.id,
      });

    if (linkErr) {
      // Property created but link failed — surface it; admin can fix manually.
      // Don't roll back the property; partial success is better than re-creating
      // a duplicate next sync.
      results.push({
        hostaway_listing_id: listingId,
        name: displayName,
        address,
        status: 'error',
        property_id: newProp.id,
        error: `Property created but link to client failed: ${linkErr.message}`,
      });
      continue;
    }

    results.push({
      hostaway_listing_id: listingId,
      name: displayName,
      address,
      status: 'created',
      property_id: newProp.id,
    });
  }

  // 4. Update last_synced_at on the token row
  const { error: stampErr } = await sb
    .from('hostaway_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  if (stampErr) {
    // Non-fatal — log on the response but still return the sync results
    console.warn('Failed to update last_synced_at', stampErr.message);
  }

  // 5. Return summary
  const matched = results.filter((r) => r.status === 'matched').length;
  const created = results.filter((r) => r.status === 'created').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return json({
    status: 'ok',
    summary: {
      total: results.length,
      matched,
      created,
      errors,
    },
    results,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
