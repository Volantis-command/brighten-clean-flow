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
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
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
    const { job_id } = await req.json();
    if (!job_id) throw new Error('job_id is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: job } = await supabase
      .from('jobs')
      .select('id, xero_invoice_id, invoice_status')
      .eq('id', job_id)
      .maybeSingle();

    if (!job?.xero_invoice_id) throw new Error('No Xero invoice found for this job');

    const { access_token, tenant_id } = await getValidToken(supabase);

    // 1. Update invoice from DRAFT to AUTHORISED
    const updateRes = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${job.xero_invoice_id}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Xero-Tenant-Id': tenant_id,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ Invoices: [{ InvoiceID: job.xero_invoice_id, Status: 'AUTHORISED' }] }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to authorise invoice: ${errText}`);
    }

    // 2. Email the invoice — and check the response. Previously this was
    //    fire-and-forget which silently set status='sent' even on failure.
    const emailRes = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${job.xero_invoice_id}/Email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Xero-Tenant-Id': tenant_id,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      // Xero accepted the AUTHORISED step but the email failed (no email on
      // contact, Xero email service issue, etc.). Mark the invoice as
      // 'authorised' (still in Xero, just not emailed) so admin can retry.
      await supabase.from('jobs').update({
        invoice_status: 'authorised',
        invoice_raised_at: new Date().toISOString(),
      }).eq('id', job_id);
      throw new Error(`Invoice authorised but email failed: ${errText}`);
    }

    // 3. Both steps succeeded — mark sent
    await supabase.from('jobs').update({
      invoice_status: 'sent',
      invoice_sent_at: new Date().toISOString(),
      invoice_raised_at: new Date().toISOString(),
    }).eq('id', job_id);

    return new Response(JSON.stringify({ success: true, status: 'sent' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('xero-send-invoice error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
