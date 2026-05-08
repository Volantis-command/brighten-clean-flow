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
  const searchRes = await fetch(
    `https://api.xero.com/api.xro/2.0/Contacts?where=Name=="${encodeURIComponent(name)}"`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Xero-Tenant-Id': tenant_id,
        Accept: 'application/json',
      },
    }
  );
  const searchData = await searchRes.json();
  if (searchData?.Contacts?.length > 0) {
    const existing = searchData.Contacts[0];
    // If we have an email and the existing contact doesn't, update it
    if (email && !existing.EmailAddress) {
      await fetch(`https://api.xero.com/api.xro/2.0/Contacts/${existing.ContactID}`, {
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
  const createRes = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
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
  const createData = await createRes.json();
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
        'id, scheduled_date, price_ex_gst, price_inc_gst, linked_quote_id, xero_invoice_id, properties(id, property_name, address, suburb, client_name, billing_email, client_type)'
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
    const property: any = job.properties || {};
    if (property.id) {
      const { data: cpLink } = await supabase
        .from('client_properties')
        .select('profiles:client_id(weekly_invoice)')
        .eq('property_id', property.id)
        .limit(1)
        .maybeSingle();
      const weeklyInvoice = (cpLink as any)?.profiles?.weekly_invoice === true;
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

    if (!(totalEx > 0)) {
      throw new Error('No price set on job — cannot create invoice');
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

    // Find or create contact
    const contactName = property.client_name || property.property_name || 'Client';
    const contactEmail = property.client_email || null;
    const contactId = await findOrCreateContact(
      access_token,
      tenant_id,
      contactName,
      contactEmail
    );

    // Generate invoice number
    const prefix = 'BCL-';
    const timestamp = Date.now().toString(36).toUpperCase();
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${timestamp}`;

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
    const invRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
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
