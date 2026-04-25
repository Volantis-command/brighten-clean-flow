// Hostaway OAuth handshake — admin enters a client's Hostaway
// client_id + client_secret in the Brightly UI; this function exchanges
// them for a long-lived access token and stores everything in
// hostaway_tokens, scoped to the Brightly client_id.
//
// Hostaway's token endpoint:
//   POST https://api.hostaway.com/v1/accessTokens
//   form-encoded body: grant_type=client_credentials&client_id=...&client_secret=...&scope=general
//   response: { access_token, expires_in, token_type, account_id }
//
// Token lifetime is ~24 months — we don't need a refresh flow for the
// first version. When a token is close to expiry the admin re-runs
// this from the UI.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  client_id: string;             // Brightly client_id (profiles.id)
  hostaway_client_id: string;    // Hostaway's client_id
  hostaway_client_secret: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.client_id || !body.hostaway_client_id || !body.hostaway_client_secret) {
    return json({ error: 'Missing required fields: client_id, hostaway_client_id, hostaway_client_secret' }, 400);
  }

  // Exchange Hostaway credentials for an access token
  const tokenResp = await fetch('https://api.hostaway.com/v1/accessTokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: body.hostaway_client_id,
      client_secret: body.hostaway_client_secret,
      scope: 'general',
    }).toString(),
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    return json({ error: 'Hostaway rejected credentials', detail: errText, status: tokenResp.status }, 400);
  }

  const tokenData = await tokenResp.json() as {
    access_token: string;
    expires_in?: number;
    token_type?: string;
    account_id?: number | string;
  };

  if (!tokenData.access_token) {
    return json({ error: 'Hostaway response missing access_token', detail: tokenData }, 502);
  }

  // Hostaway's account_id field varies between docs versions — coerce to string
  const hostawayAccountId = String(tokenData.account_id ?? body.hostaway_client_id);

  // Compute expires_at if Hostaway returned a TTL
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  // Store the token in hostaway_tokens (upsert on client_id + account_id)
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: upsertErr } = await sb
    .from('hostaway_tokens')
    .upsert(
      {
        client_id: body.client_id,
        hostaway_account_id: hostawayAccountId,
        access_token: tokenData.access_token,
        expires_at: expiresAt,
        hostaway_client_id: body.hostaway_client_id,
      },
      { onConflict: 'client_id,hostaway_account_id' },
    );

  if (upsertErr) {
    return json({ error: 'Failed to store Hostaway token', detail: upsertErr.message }, 500);
  }

  return json({
    status: 'connected',
    hostaway_account_id: hostawayAccountId,
    token_lifetime_seconds: tokenData.expires_in ?? null,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
