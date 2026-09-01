import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Xero rate-limits (HTTP 429) when too many calls arrive in a short window —
// the per-clean auto-invoice easily bursts past the ~60/min limit when a
// cleaner finishes several jobs back to back. Retry on 429/503, honouring the
// Retry-After header (or exponential backoff), so transient limits self-heal
// instead of failing the invoice with "Xero invoice creation failed [429]".
async function xeroFetch(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) return res;
    if (attempt >= maxRetries) return res; // give up — let the caller handle the non-ok
    const retryAfter = Number(res.headers.get('Retry-After'));
    // A Retry-After of minutes-to-hours is Xero's DAILY quota, not the
    // per-minute limit. Sleeping on it once held a request for 11 hours
    // (1 Sep 2026), so past 30s we surface it instead of waiting it out.
    if (Number.isFinite(retryAfter) && retryAfter > 30) {
      const when = new Date(Date.now() + retryAfter * 1000)
        .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' });
      throw new Error(`Xero's daily API limit is used up. Invoicing works again about ${when}. Nothing is lost, retry then.`);
    }
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(1000 * 2 ** attempt, 8000); // 1s, 2s, 4s, 8s
    console.log(`Xero ${res.status} — backing off ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, waitMs));
    attempt++;
  }
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
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    });
    if (!res.ok) throw new Error('Token refresh failed');
    const newTokens = await res.json();
    await supabase
      .from('xero_tokens')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokens.id);
    return { access_token: newTokens.access_token, tenant_id: tokens.tenant_id };
  }
  return { access_token: tokens.access_token, tenant_id: tokens.tenant_id };
}

async function findOrCreateContact(
  access_token: string,
  tenant_id: string,
  name: string,
  email?: string | null
) {
  // Search by name first
  const searchRes = await xeroFetch(
    `https://api.xero.com/api.xro/2.0/Contacts?where=Name=="${encodeURIComponent(name)}"`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Xero-Tenant-Id': tenant_id,
        Accept: 'application/json',
      },
    }
  );
  if (searchRes.status === 401) throw new Error('Xero token expired — reconnect Xero in Settings');
  const searchText = await searchRes.text();
  const searchData = searchText ? JSON.parse(searchText) : {};
  if (searchData?.Contacts?.length > 0) {
    const existing = searchData.Contacts[0];
    // If we have an email and the existing contact doesn't, update it
    if (email && !existing.EmailAddress) {
      await xeroFetch(`https://api.xero.com/api.xro/2.0/Contacts/${existing.ContactID}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Xero-Tenant-Id': tenant_id,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ Contacts: [{ ContactID: existing.ContactID, EmailAddress: email }] }),
      });
    }
    return existing.ContactID;
  }

  // Create
  const createRes = await xeroFetch('https://api.xero.com/api.xro/2.0/Contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Xero-Tenant-Id': tenant_id,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      Contacts: [{ Name: name, ...(email ? { EmailAddress: email } : {}) }],
    }),
  });
  if (createRes.status === 401) throw new Error('Xero token expired — reconnect Xero in Settings');
  const createText = await createRes.text();
  const createData = createText ? JSON.parse(createText) : {};
  return createData?.Contacts?.[0]?.ContactID || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, function: 'xero-auto-invoice-job' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Lift these out of the try so the catch block can persist failure state
  // to the job (Brendan 2026-05-08: silent failures were the main reason
  // missed cleans went invisible — failures must be visible).
  let job_id: string | undefined;
  let supabase: any;

  try {
    const raw = await req.text();
    if (!raw) {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = JSON.parse(raw);
    job_id = body.job_id;
    const send_email = body.send_email;
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'job_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('xero-auto-invoice-job called for job:', job_id);

    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch the job and related data
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select(
        'id, scheduled_date, price_ex_gst, price_inc_gst, linked_quote_id, xero_invoice_id, properties(id, property_name, address, suburb, client_name, billing_email, client_type, price_turnover, default_price, price_includes_gst)'
      )
      .eq('id', job_id)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) throw new Error('Job not found');

    // Skip if already invoiced
    if (job.xero_invoice_id) {
      console.log('Job already invoiced:', job.xero_invoice_id);
      return new Response(
        JSON.stringify({ success: true, skipped: true, invoice_id: job.xero_invoice_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if client uses weekly batch invoicing — their jobs are handled
    // by xero-weekly-batch-invoice every Monday.
    // Also grab the client's profile name (company name) for use on the invoice.
    const property: any = job.properties || {};
    let clientProfileName: string | null = null;
    if (property.id) {
      const { data: cpLink } = await supabase
        .from('client_properties')
        .select('profiles:client_id(full_name, weekly_invoice)')
        .eq('property_id', property.id)
        .limit(1)
        .maybeSingle();
      const weeklyInvoice = (cpLink as any)?.profiles?.weekly_invoice === true;
      clientProfileName = (cpLink as any)?.profiles?.full_name || null;
      if (weeklyInvoice) {
        console.log('Client uses weekly invoicing — skipping per-job auto-invoice for job', job_id);
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'weekly_invoice client' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    const cleanType =
      property.client_type === 'airbnb' ? 'Airbnb Turnover Clean' : 'House Clean';
    const dateStr = job.scheduled_date || new Date().toISOString().slice(0, 10);

    // Sell price ex GST. Prefer the job row (this is what admins see in
    // the Brightly UI and what should match the invoice). Fall back to
    // the linked quote's sell_price_ex_gst only when the job is missing
    // a price — defensive for older jobs predating price-on-job.
    //
    // Why we DON'T break the line into labour / linen / consumables
    // any more: those columns on `quotes` are internal COSTS, not
    // customer-facing prices. Using them produced invoices that
    // underbilled by the margin amount (Brendan 2026-04-28: Olivia's
    // job was $200 inc on the Brightly side but the auto-invoice came
    // out at $120 because it was summing the cost columns instead of
    // the sell price). One line item @ sell price = one number that
    // matches the quote.
    let totalEx = Number(job.price_ex_gst) || 0;
    if (!(totalEx > 0) && job.linked_quote_id) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('sell_price_ex_gst')
        .eq('id', job.linked_quote_id)
        .maybeSingle();
      if (quote) totalEx = Number(quote.sell_price_ex_gst) || 0;
    }
    // Third fallback: property default price. Hostaway-synced jobs often
    // have no price on the job row itself — the price lives on the property.
    // price_turnover is always ex-GST. default_price may be inc-GST
    // depending on the price_includes_gst flag.
    if (!(totalEx > 0)) {
      if (Number(property.price_turnover) > 0) {
        totalEx = Number(property.price_turnover);
        console.log('Using property.price_turnover fallback:', totalEx);
      } else if (Number(property.default_price) > 0) {
        const dp = Number(property.default_price);
        totalEx = property.price_includes_gst ? Math.round((dp / 1.1) * 100) / 100 : dp;
        console.log('Using property.default_price fallback:', totalEx, 'inc_gst:', property.price_includes_gst);
      }
    }

    if (!(totalEx > 0)) {
      throw new Error('No price set on job or property — cannot create invoice');
    }

    const lineItems = [
      {
        Description: `${cleanType} — ${property.property_name || 'Property'}${
          property.suburb ? ` (${property.suburb})` : ''
        } — ${dateStr}`,
        Quantity: 1,
        UnitAmount: totalEx.toFixed(2),
        AccountCode: '200',
        TaxType: 'OUTPUT',
      },
    ];

    // Get Xero token
    const { access_token, tenant_id } = await getValidToken(supabase);

    // Find or create contact — prefer the profile full_name (company name) over
    // the property's client_name which may be an individual owner's name.
    const contactName = clientProfileName || property.client_name || property.property_name || 'Client';
    const contactEmail = property.client_email || null;
    const contactId = await findOrCreateContact(
      access_token,
      tenant_id,
      contactName,
      contactEmail
    );

    // Generate sequential invoice number starting at INV-1000
    const { data: lastInvoice } = await supabase
      .from('jobs')
      .select('xero_invoice_number')
      .like('xero_invoice_number', 'INV-%')
      .order('xero_invoice_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastNum = lastInvoice?.xero_invoice_number
      ? parseInt(lastInvoice.xero_invoice_number.replace('INV-', ''), 10)
      : 999;
    const nextNum = isNaN(lastNum) ? 1000 : lastNum + 1;
    const invoiceNumber = `INV-${nextNum}`;

    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 7);

    const invoiceBody: any = {
      Type: 'ACCREC',
      InvoiceNumber: invoiceNumber,
      Reference: `Job ${job.id.slice(0, 8)} — ${dateStr}`,
      Date: today.toISOString().split('T')[0],
      DueDate: dueDate.toISOString().split('T')[0],
      Status: 'DRAFT', // Admin must approve before sending
      CurrencyCode: 'AUD',
      LineAmountTypes: 'Exclusive',
      LineItems: lineItems,
    };

    if (contactId) invoiceBody.Contact = { ContactID: contactId };

    console.log('Creating Xero invoice with', lineItems.length, 'line items');
    const invRes = await xeroFetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Xero-Tenant-Id': tenant_id,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ Invoices: [invoiceBody] }),
    });

    const responseText = await invRes.text();
    console.log('Xero response:', invRes.status);

    if (!invRes.ok) {
      throw new Error(`Xero invoice creation failed [${invRes.status}]: ${responseText}`);
    }

    const invData = JSON.parse(responseText);
    const invoice = invData?.Invoices?.[0];
    const xeroInvoiceId = invoice?.InvoiceID;
    const totalIncGst = Number(invoice?.Total) || totalEx * 1.1;

    // Update job — clear any prior failure state so retries flip clean.
    await supabase
      .from('jobs')
      .update({
        xero_invoice_id: xeroInvoiceId,
        xero_invoice_number: invoiceNumber,
        invoice_status: 'draft',
        invoice_amount: totalEx,
        invoice_error: null,
        invoice_raised_at: new Date().toISOString(),
      })
      .eq('id', job_id);

    // Invoice created as DRAFT — admin must approve via xero-send-invoice
    console.log('Invoice created as DRAFT — awaiting admin approval');

    return new Response(
      JSON.stringify({
        success: true,
        invoice_id: xeroInvoiceId,
        invoice_number: invoiceNumber,
        total_inc_gst: totalIncGst,
        line_items: lineItems.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('xero-auto-invoice-job error:', err);

    // Persist the failure to the job so it's visible on PendingInvoicesPage.
    // Don't blow up the response if this write fails — log and move on.
    if (job_id && supabase) {
      try {
        await supabase
          .from('jobs')
          .update({
            invoice_status: 'failed',
            invoice_error: String(err?.message ?? err).slice(0, 500),
          })
          .eq('id', job_id);
      } catch (writeErr) {
        console.error('xero-auto-invoice-job: failed to persist failure state', writeErr);
      }
    }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
