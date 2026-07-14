// xero-weekly-batch-invoice
//
// Runs every Monday (via pg_cron) and creates one consolidated Xero invoice
// per client that has weekly_invoice = true on their profile.
//
// Invoice covers: completed, uninvoiced jobs scheduled Mon–Sun of the
// previous calendar week (relative to when the function runs).
//
// Each job becomes one line item: "[Property Name] — [Date]"
//
// After creating the invoice, all included jobs are stamped with:
//   invoice_status = 'draft'
//   xero_invoice_id = <shared invoice ID>
//   xero_invoice_number = <shared invoice number>
//   invoice_raised_at = now()
//
// Idempotent: jobs already stamped with an xero_invoice_id are skipped.
//
// Can also be triggered manually by POST with { client_id, date_from, date_to }
// to re-run for a specific client / custom date range.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Retry Xero calls on 429/503 (rate limit), honouring Retry-After / backoff.
async function xeroFetch(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    if (attempt >= maxRetries) return res;
    const retryAfter = Number(res.headers.get('Retry-After'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(1000 * 2 ** attempt, 8000);
    await new Promise((r) => setTimeout(r, waitMs));
    attempt++;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-07-14" → "14 Jul". */
function fmtDate(iso: string): string {
  const parts = String(iso).split('-');
  if (parts.length !== 3) return String(iso);
  return `${Number(parts[2])} ${MONTHS[Number(parts[1]) - 1] || ''}`.trim();
}

/** Pull the guest name out of a job's notes when there's no guest_name column value.
 *  Handles "Hostaway turnover — NAME", "Guest: NAME", etc. */
function guestFromNotes(notes: string | null): string {
  if (!notes) return '';
  const first = notes.split('\n')[0].trim();
  let m = first.match(/(?:turnover|clean)\s+[—-]\s+(.+)$/i);
  if (m) return m[1].trim();
  m = first.match(/guest:\s*(.+)$/i);
  if (m) return m[1].trim();
  return '';
}

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

/** Find or create a Xero contact by name, updating email if missing. */
async function resolveXeroContact(
  name: string,
  email: string | null,
  access_token: string,
  tenant_id: string,
): Promise<string | null> {
  const headers = {
    'Authorization': `Bearer ${access_token}`,
    'Xero-Tenant-Id': tenant_id,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const searchRes = await xeroFetch(
    `https://api.xero.com/api.xro/2.0/Contacts?where=Name=="${encodeURIComponent(name)}"`,
    { headers },
  );
  const searchData = await searchRes.json();

  if (searchData?.Contacts?.length > 0) {
    const contact = searchData.Contacts[0];
    const contactId = contact.ContactID;
    // Patch email if missing
    if (email && !contact.EmailAddress) {
      await xeroFetch('https://api.xero.com/api.xro/2.0/Contacts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ Contacts: [{ ContactID: contactId, EmailAddress: email }] }),
      });
    }
    return contactId;
  }

  const newContact: any = { Name: name };
  if (email) newContact.EmailAddress = email;
  const createRes = await xeroFetch('https://api.xero.com/api.xro/2.0/Contacts', {
    method: 'POST',
    headers,
    body: JSON.stringify({ Contacts: [newContact] }),
  });
  const createData = await createRes.json();
  return createData?.Contacts?.[0]?.ContactID || null;
}

/** Previous Mon–Sun in Gold Coast time (AEST, UTC+10, no DST), as YYYY-MM-DD.
 *  The Monday cron fires at 20:00 UTC Sunday (= 06:00 Monday AEST), so the raw
 *  UTC clock still reads "Sunday" when it runs. We shift into AEST wall-clock
 *  first and use UTC accessors on that shifted value, so day-of-week and the
 *  resulting date strings reflect the Gold Coast week — not UTC. */
function lastWeekRange(now = new Date()): { from: string; to: string } {
  const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;
  const aest = new Date(now.getTime() + AEST_OFFSET_MS);
  // Day of week in AEST: 0=Sun, 1=Mon … 6=Sat
  const dow = aest.getUTCDay();
  const daysSinceLastMon = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(aest);
  thisMonday.setUTCDate(aest.getUTCDate() - daysSinceLastMon);

  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);

  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(lastMonday), to: fmt(lastSunday) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  // Date range — override from body for manual/backfill runs
  const { from: defaultFrom, to: defaultTo } = lastWeekRange();
  const dateFrom: string = body.date_from || defaultFrom;
  const dateTo: string   = body.date_to   || defaultTo;

  console.log(`Weekly batch invoice run — period: ${dateFrom} to ${dateTo}`);

  try {
    // 1. Find all weekly-invoice clients (or just the one passed in body)
    let clientQuery = supabase.from('profiles').select('id, full_name, email').eq('weekly_invoice', true);
    if (body.client_id) clientQuery = clientQuery.eq('id', body.client_id);
    const { data: clients, error: clientErr } = await clientQuery;
    if (clientErr) throw clientErr;
    if (!clients?.length) {
      return new Response(JSON.stringify({ ok: true, message: 'No weekly-invoice clients found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token, tenant_id } = await getValidToken(supabase);

    const results: any[] = [];

    for (const client of clients) {
      try {
        // 2. Get all property IDs for this client
        const { data: cpLinks } = await supabase
          .from('client_properties')
          .select('property_id')
          .eq('client_id', client.id);
        const propertyIds = (cpLinks || []).map((l: any) => l.property_id).filter(Boolean);
        if (!propertyIds.length) {
          results.push({ client_id: client.id, client_name: client.full_name, skipped: true, reason: 'No properties linked' });
          continue;
        }

        // 3. Find uninvoiced completed jobs in the date range
        const { data: jobs, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, scheduled_date, price_ex_gst, price_inc_gst, guest_name, notes, properties:property_id(property_name, billing_email)')
          .eq('status', 'completed')
          .is('xero_invoice_id', null)
          .in('property_id', propertyIds)
          .gte('scheduled_date', dateFrom)
          .lte('scheduled_date', dateTo)
          .order('scheduled_date', { ascending: true });
        if (jobsErr) throw jobsErr;
        if (!jobs?.length) {
          results.push({ client_id: client.id, client_name: client.full_name, skipped: true, reason: 'No uninvoiced jobs in period' });
          continue;
        }

        // 4. Build line items — one per job
        let totalEx = 0;
        const lineItems = jobs.map((job: any) => {
          const prop: any = job.properties || {};
          const ex = Number(job.price_ex_gst) || Number(job.price_inc_gst) / 1.1 || 0;
          totalEx += ex;
          // BnB Hub's requested line format: Date — Property — Guest name.
          const guest = (job.guest_name || guestFromNotes(job.notes) || '').trim();
          const description = [fmtDate(job.scheduled_date), prop.property_name || 'Property', guest]
            .filter(Boolean)
            .join(' — ');
          return {
            Description: description,
            Quantity: 1,
            UnitAmount: ex.toFixed(2),
            AccountCode: '200',
            TaxType: 'OUTPUT',
          };
        });

        if (totalEx <= 0) {
          results.push({ client_id: client.id, client_name: client.full_name, skipped: true, reason: 'All jobs have $0 price' });
          continue;
        }

        // 5. Resolve/create Xero contact
        const billingEmail = (jobs[0] as any)?.properties?.billing_email || client.email || null;
        const contactId = await resolveXeroContact(
          client.full_name || 'Client',
          billingEmail,
          access_token,
          tenant_id,
        );

        // 6. Create the consolidated invoice
        const prefix = 'BCL-';
        const timestamp = Date.now().toString(36).toUpperCase();
        const invoiceNumber = `${prefix}${new Date().getFullYear()}-${timestamp}`;
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(today.getDate() + 7);

        const invoiceBody: any = {
          Type: 'ACCREC',
          InvoiceNumber: invoiceNumber,
          Reference: `Week of ${dateFrom}`,
          Date: today.toISOString().slice(0, 10),
          DueDate: dueDate.toISOString().slice(0, 10),
          Status: 'DRAFT',
          CurrencyCode: 'AUD',
          LineAmountTypes: 'Exclusive',
          LineItems: lineItems,
        };
        if (contactId) invoiceBody.Contact = { ContactID: contactId };

        const invRes = await xeroFetch('https://api.xero.com/api.xro/2.0/Invoices', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Xero-Tenant-Id': tenant_id,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ Invoices: [invoiceBody] }),
        });
        const invText = await invRes.text();
        if (!invRes.ok) throw new Error(`Xero invoice creation failed [${invRes.status}]: ${invText}`);

        const invData = JSON.parse(invText);
        const xeroInvoiceId = invData?.Invoices?.[0]?.InvoiceID;
        if (!xeroInvoiceId) throw new Error('No InvoiceID returned from Xero');

        // 7. Stamp all jobs with the shared invoice details
        const jobIds = jobs.map((j: any) => j.id);
        await supabase
          .from('jobs')
          .update({
            xero_invoice_id: xeroInvoiceId,
            xero_invoice_number: invoiceNumber,
            invoice_status: 'draft',
            invoice_amount: totalEx,
            invoice_raised_at: new Date().toISOString(),
          })
          .in('id', jobIds);

        results.push({
          client_id: client.id,
          client_name: client.full_name,
          invoice_number: invoiceNumber,
          xero_invoice_id: xeroInvoiceId,
          jobs_included: jobIds.length,
          total_ex_gst: totalEx.toFixed(2),
          period: `${dateFrom} to ${dateTo}`,
        });

        console.log(`Created batch invoice ${invoiceNumber} for ${client.full_name}: ${jobIds.length} jobs, $${totalEx.toFixed(2)} ex GST`);
      } catch (clientErr: any) {
        console.error(`Failed for client ${client.full_name}:`, clientErr.message);
        results.push({ client_id: client.id, client_name: client.full_name, error: clientErr.message });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('xero-weekly-batch-invoice error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
