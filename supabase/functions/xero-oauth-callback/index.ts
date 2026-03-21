import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const action = url.searchParams.get('action');

    // Handle disconnect
    if (action === 'disconnect') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase.from('xero_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle auth URL generation
    if (action === 'get_auth_url') {
      const clientId = Deno.env.get('XERO_CLIENT_ID');
      if (!clientId) return new Response(JSON.stringify({ error: 'XERO_CLIENT_ID not set' }), { status: 500, headers: corsHeaders });
      
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/xero-oauth-callback`;
      const scopes = 'openid profile email accounting.transactions accounting.contacts accounting.settings offline_access';
      const authUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=brightly`;
      
      return new Response(JSON.stringify({ url: authUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle status check
    if (action === 'status') {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      const { data: tokens } = await supabase.from('xero_tokens').select('tenant_id, expires_at, updated_at').limit(1).single();
      
      if (!tokens) {
        return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Try to get org name from Xero
      let orgName = null;
      try {
        const { data: freshTokens } = await supabase.from('xero_tokens').select('access_token, tenant_id').limit(1).single();
        if (freshTokens?.access_token && freshTokens?.tenant_id) {
          const orgRes = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
            headers: {
              'Authorization': `Bearer ${freshTokens.access_token}`,
              'Xero-Tenant-Id': freshTokens.tenant_id,
              'Accept': 'application/json',
            },
          });
          if (orgRes.ok) {
            const orgData = await orgRes.json();
            orgName = orgData?.Organisations?.[0]?.Name || null;
          }
        }
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ 
        connected: true, 
        tenant_id: tokens.tenant_id,
        last_synced: tokens.updated_at,
        org_name: orgName,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle OAuth callback with code
    if (!code) {
      return new Response('<html><body><h1>Error: No authorization code</h1></body></html>', { 
        headers: { 'Content-Type': 'text/html' } 
      });
    }

    const clientId = Deno.env.get('XERO_CLIENT_ID')!;
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')!;
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/xero-oauth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new Response(`<html><body><h1>Token exchange failed</h1><p>${errText}</p></body></html>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const tokenData = await tokenRes.json();

    // Get tenant ID from connections
    const connectionsRes = await fetch('https://api.xero.com/connections', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const connections = await connectionsRes.json();
    const tenantId = connections?.[0]?.tenantId || null;

    // Store tokens
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Delete any existing tokens first
    await supabase.from('xero_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    await supabase.from('xero_tokens').insert({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      tenant_id: tenantId,
      expires_at: expiresAt,
    });

    // Redirect back to app
    return new Response(`<html><body><script>window.close(); window.opener && window.opener.postMessage('xero_connected', '*');</script><h1>✅ Xero Connected!</h1><p>You can close this tab.</p></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (err) {
    console.error('Xero OAuth error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
