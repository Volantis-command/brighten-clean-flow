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

    // Get all jobs with a Xero invoice that aren't paid yet (include property
    // name + invoice number for the paid notification body).
    const { data: jobs, error: jobsErr } = await supabase
      .from('jobs')
      .select('id, xero_invoice_id, xero_invoice_number, invoice_status, invoice_amount, properties(property_name)')
      .not('xero_invoice_id', 'is', null)
      .not('invoice_status', 'in', '(paid,voided,none)');

    if (jobsErr) throw jobsErr;
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: 'No invoices to sync' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pre-load admin user_ids once (avoids one query per status transition)
    const { data: adminRows } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    const adminIds: string[] = (adminRows || []).map((r: any) => r.user_id);

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

    // Fetch statuses in pages of 40 rather than one call per invoice.
    const byId: Record<string, any> = {};
    for (let i = 0; i < jobs.length; i += 40) {
      const page = jobs.slice(i, i + 40);
      const ids = page.map((j: any) => j.xero_invoice_id).join(',');
      const res = await fetch(`https://api.xero.com/api.xro/2.0/Invoices?IDs=${ids}`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Xero-Tenant-Id': tenant_id,
          'Accept': 'application/json',
        },
      });
      if (!res.ok) {
        errors.push(`Batch ${i / 40}: Xero API ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const inv of data?.Invoices || []) byId[inv.InvoiceID] = inv;
    }

    for (const job of jobs) {
      try {
        const invoice = byId[job.xero_invoice_id];
        if (!invoice) continue; // not in Xero's response (deleted there)
        const xeroStatus = (invoice?.Status || '').toLowerCase();
        const newStatus = statusMap[xeroStatus] || xeroStatus;

        if (newStatus !== job.invoice_status) {
          const update: Record<string, any> = { invoice_status: newStatus };
          if (newStatus === 'paid') update.invoice_paid_at = new Date().toISOString();
          if (newStatus === 'sent' && !job.invoice_status) update.invoice_sent_at = new Date().toISOString();

          await supabase.from('jobs').update(update).eq('id', job.id);
          synced++;

          // Notify admins when an invoice flips to paid
          if (newStatus === 'paid' && adminIds.length > 0) {
            const propName = (job as any).properties?.property_name || 'a property';
            const amountStr = job.invoice_amount ? ` ($${Number(job.invoice_amount).toFixed(2)})` : '';
            const number = job.xero_invoice_number ? ` #${job.xero_invoice_number}` : '';
            const rows = adminIds.map((uid) => ({
              user_id: uid,
              title: 'Invoice Paid 💰',
              message: `Invoice${number} for ${propName}${amountStr} has been marked paid in Xero.`,
              type: 'invoice_paid',
              tier: 'info',
              event_type: 'invoice_paid',
              metadata: { job_id: job.id, xero_invoice_id: job.xero_invoice_id },
              link: `/jobs/${job.id}`,
              read: false,
            }));
            await supabase.from('notifications').insert(rows);
          }
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
