import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getValidToken(supabase: any) {
  const { data: tokens } = await supabase.from('xero_tokens').select('*').limit(1).single();
  if (!tokens) throw new Error('Xero not connected');

  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const clientId = Deno.env.get('XERO_CLIENT_ID')!;
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')!;
    const res = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    });
    if (!res.ok) throw new Error('Token refresh failed');
    const newTokens = await res.json();
    await supabase.from('xero_tokens').update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', tokens.id);
    return { access_token: newTokens.access_token, tenant_id: tokens.tenant_id };
  }
  return { access_token: tokens.access_token, tenant_id: tokens.tenant_id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all jobs with a Xero invoice that aren't paid yet
    const { data: jobs, error: jobsErr } = await supabase
      .from('jobs')
      .select('id, xero_invoice_id, invoice_status')
      .not('xero_invoice_id', 'is', null)
      .neq('invoice_status', 'paid');

    if (jobsErr) throw jobsErr;
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: 'No invoices to sync' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token, tenant_id } = await getValidToken(supabase);

    const statusMap: Record<string, string> = {
      draft: 'draft',
      submitted: 'sent',
      authorised: 'sent',
      paid: 'paid',
      voided: 'voided',
      deleted: 'none',
    };

    let synced = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      try {
        const res = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${job.xero_invoice_id}`, {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Xero-Tenant-Id': tenant_id,
            'Accept': 'application/json',
          },
        });

        if (!res.ok) {
          errors.push(`Job ${job.id}: Xero API ${res.status}`);
          continue;
        }

        const data = await res.json();
        const invoice = data?.Invoices?.[0];
        const xeroStatus = (invoice?.Status || '').toLowerCase();
        const newStatus = statusMap[xeroStatus] || xeroStatus;

        if (newStatus !== job.invoice_status) {
          await supabase.from('jobs').update({ invoice_status: newStatus }).eq('id', job.id);
          synced++;
        }
      } catch (err: any) {
        errors.push(`Job ${job.id}: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({ synced, total: jobs.length, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Sync error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
