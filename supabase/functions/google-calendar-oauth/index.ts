import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-oauth?action=callback`;

    if (action === 'get_auth_url') {
      if (!clientId) {
        return new Response(JSON.stringify({ error: 'Google Calendar Client ID not configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const scopes = encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent`;
      return new Response(JSON.stringify({ url: authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('<html><body><h2>Authorization failed</h2></body></html>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('Token exchange failed:', errText);
        return new Response(`<html><body><h2>Token exchange failed</h2><p>${errText}</p></body></html>`, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const tokens = await tokenRes.json();

      // Get user email
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoRes.json();

      // Upsert config
      const { data: existing } = await supabase
        .from('google_calendar_config')
        .select('id')
        .limit(1)
        .maybeSingle();

      const configData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        email: userInfo.email,
        calendar_id: 'primary',
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from('google_calendar_config').update(configData).eq('id', existing.id);
      } else {
        await supabase.from('google_calendar_config').insert(configData);
      }

      return new Response(`
        <html><body>
          <h2>Google Calendar Connected!</h2>
          <p>Connected as ${userInfo.email}. You can close this window.</p>
          <script>window.opener?.postMessage('gcal_connected','*');window.close();</script>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html' } });
    }

    if (action === 'status') {
      const { data: config } = await supabase
        .from('google_calendar_config')
        .select('access_token, email')
        .limit(1)
        .maybeSingle();
      return new Response(JSON.stringify({
        connected: !!config?.access_token,
        email: config?.email || null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Google Calendar OAuth error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
