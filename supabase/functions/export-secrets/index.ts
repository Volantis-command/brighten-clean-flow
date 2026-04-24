// One-off secrets exporter for the Lovable Cloud → owned Supabase
// migration (2026-04-25). Reads known secret names from Deno.env and
// returns them as JSON so they can be piped into the new Supabase
// project's secrets panel via `supabase secrets set`.
//
// Guarded by the same EXPORT_SHARED_SECRET header used by
// export-all-data — one secret, two functions.
//
// DELETE THIS FUNCTION FROM THE REPO after migration complete. Leaving
// a secrets-exporter deployed is a standing footgun.
//
// Why not just copy-paste from Lovable's Secrets UI: Lovable Cloud
// masks secret values after save. The values are only accessible via
// the edge function runtime (Deno.env), not the UI.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-export-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Explicit allowlist — the only secrets we migrate. Lovable-specific
// secrets (LOVABLE_API_KEY) are deliberately excluded. Also excluded:
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_DB_URL — these are auto-injected by Supabase and differ per
// project. The new project has its own.
const ALLOWED_SECRETS = [
  // Twilio (SMS)
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  // Xero (invoicing)
  'XERO_CLIENT_ID',
  'XERO_CLIENT_SECRET',
  // Google (calendar + drive)
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  // Stripe (deposits — not live yet but wired)
  'STRIPE_SECRET_KEY',
  // Contact info (used by SMS/email templates)
  'ADMIN_PHONE',
];

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get('EXPORT_SHARED_SECRET');
  if (!expectedSecret || expectedSecret.length < 16) {
    return new Response(
      JSON.stringify({ error: 'EXPORT_SHARED_SECRET is not configured.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  const providedSecret = req.headers.get('x-export-secret');
  if (providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const result: Record<string, { present: boolean; length: number; value: string | null }> = {};
  for (const name of ALLOWED_SECRETS) {
    const value = Deno.env.get(name);
    result[name] = value
      ? { present: true, length: value.length, value }
      : { present: false, length: 0, value: null };
  }

  return new Response(
    JSON.stringify({
      exported_at: new Date().toISOString(),
      secrets: result,
    }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
