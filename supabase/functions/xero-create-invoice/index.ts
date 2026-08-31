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
    const body = await req.json();
    let { job_id, quote_id, contact_name, description, amount, account_code, invoice_prefix, due_days } = body;
    console.log('xero-create-invoice called with:', JSON.stringify({ job_id, quote_id, contact_name, amount, account_code }));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // If only job_id was passed, hydrate contact/amount/description from the job.
    //
    // The contact name is ALWAYS resolved here for a job, even when the caller
    // sent one. Callers were passing `property.client_name || property.property_name`,
    // so when a property had no client name the PROPERTY name went to Xero and
    // created contacts like "Collingwood" and "Roy" instead of the business that
    // actually gets the bill.
    let contact_email: string | null = null;
    if (job_id) {
      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_ex_gst, price_inc_gst, client_name, property_id, properties:property_id(property_name, address, billing_email, client_name, business_name, default_price, price_includes_gst)')
        .eq('id', job_id)
        .single();
      if (jobErr || !job) {
        throw new Error(`Job lookup failed: ${jobErr?.message || 'not found'}`);
      }
      const prop: any = (job as any).properties || {};

      // The client record is the source of truth. It is the name shown on the
      // Clients page and the one Brendan edits, so it is the one Xero must get.
      let clientName: string | null = null;
      if ((job as any).property_id) {
        const { data: link } = await supabase
          .from('client_properties')
          .select('profiles:client_id(full_name, email)')
          .eq('property_id', (job as any).property_id)
          .limit(1)
          .maybeSingle();
        clientName = (link as any)?.profiles?.full_name?.trim() || null;
        contact_email = (link as any)?.profiles?.email || null;
      }

      // Property name is deliberately NOT in this chain. A property is a place,
      // not a payer, and using it is what caused the wrong contacts.
      const resolved =
        clientName ||
        prop.business_name?.trim() ||
        prop.client_name?.trim() ||
        (job as any).client_name?.trim() ||
        null;

      if (!resolved) {
        throw new Error(
          'No client name found for this job. Open the property, link it to a client, ' +
          'and try again. Refusing to invoice under the property name, which is how ' +
          'stray Xero contacts get created.'
        );
      }
      console.log(`xero contact resolved to "${resolved}" (from ${clientName ? 'client record' : prop.business_name ? 'property.business_name' : 'property.client_name'})`);
      contact_name = resolved;
      // Price, in order of how specific it is to this particular clean.
      //
      // Jobs created from a recurring series were arriving with no price at all,
      // so invoicing them failed outright even though the property had a default
      // price sitting right there. The property default is now the third source
      // rather than giving up.
      const ex = Number((job as any).price_ex_gst || 0);
      const inc = Number((job as any).price_inc_gst || 0);
      let fallbackEx = ex > 0 ? ex : (inc > 0 ? +(inc / 1.1).toFixed(2) : 0);
      let priceSource = ex > 0 ? 'job.price_ex_gst' : inc > 0 ? 'job.price_inc_gst' : null;

      if (fallbackEx <= 0) {
        const dflt = Number(prop.default_price || 0);
        if (dflt > 0) {
          // price_includes_gst says whether that number is inc or ex. Xero wants
          // ex GST, and getting this backwards would bill 10% wrong every time.
          fallbackEx = prop.price_includes_gst ? +(dflt / 1.1).toFixed(2) : dflt;
          priceSource = `property.default_price (${prop.price_includes_gst ? 'inc' : 'ex'} GST)`;
        }
      }
      // A caller sending 0 means it had no price either, not that the clean is
      // free. One of the buttons sends `job.price_ex_gst || 0`, which turned a
      // missing price into a hard zero and skipped the fallback entirely.
      if (amount === undefined || amount === null || !(Number(amount) > 0)) {
        amount = fallbackEx;
      }
      console.log(`xero invoice amount ${amount} ex GST, from ${priceSource || 'nothing'}`);
      const dateLabel = (job as any).scheduled_date || '';
      description = description || `Cleaning service${prop.property_name ? ` — ${prop.property_name}` : ''}${dateLabel ? ` (${dateLabel})` : ''}`;

      // Billing email on the property wins, since that is set deliberately for
      // invoicing. Otherwise fall back to the client's own address, already
      // fetched above.
      contact_email = prop.billing_email || contact_email || null;
    }

    if (!contact_name) {
      throw new Error('contact_name is required (no client name found on job/property)');
    }
    if (!amount || Number(amount) <= 0) {
      throw new Error(
        'No price found for this job. Set a price on the job, or a default price ' +
        'per clean on the property, then try again.'
      );
    }

    console.log('Fetching Xero token...');
    const { access_token, tenant_id } = await getValidToken(supabase);
    console.log('Token retrieved, tenant_id:', tenant_id);

    // Find or create contact
    let contactId: string | null = null;
    if (contact_name) {
      const searchRes = await fetch(`https://api.xero.com/api.xro/2.0/Contacts?where=Name=="${encodeURIComponent(contact_name)}"`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Xero-Tenant-Id': tenant_id,
          'Accept': 'application/json',
        },
      });
      const searchData = await searchRes.json();
      if (searchData?.Contacts?.length > 0) {
        contactId = searchData.Contacts[0].ContactID;
        // If we have an email and the existing Xero contact has none, patch it in
        const existingEmail = searchData.Contacts[0].EmailAddress || '';
        if (contact_email && !existingEmail && contactId) {
          await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Xero-Tenant-Id': tenant_id,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ Contacts: [{ ContactID: contactId, EmailAddress: contact_email }] }),
          });
        }
      } else {
        const newContact: any = { Name: contact_name };
        if (contact_email) newContact.EmailAddress = contact_email;
        const createRes = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Xero-Tenant-Id': tenant_id,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ Contacts: [newContact] }),
        });
        const createData = await createRes.json();
        contactId = createData?.Contacts?.[0]?.ContactID || null;
      }
    }

    // Generate invoice number
    const prefix = invoice_prefix || 'BCL-';
    const timestamp = Date.now().toString(36).toUpperCase();
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${timestamp}`;

    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + (parseInt(due_days) || 7));

    // Use the price_ex_gst amount passed from the frontend
    const unitAmount = parseFloat(amount) || 0;

    const invoiceBody: any = {
      Type: 'ACCREC',
      InvoiceNumber: invoiceNumber,
      Reference: invoiceNumber,
      Date: today.toISOString().split('T')[0],
      DueDate: dueDate.toISOString().split('T')[0],
      Status: 'DRAFT',
      CurrencyCode: 'AUD',
      LineAmountTypes: 'Exclusive',
      LineItems: [{
        Description: description || 'Cleaning service',
        Quantity: 1,
        UnitAmount: unitAmount.toFixed(2),
        AccountCode: account_code || '200',
        TaxType: 'OUTPUT',
      }],
    };

    if (contactId) {
      invoiceBody.Contact = { ContactID: contactId };
    }

    console.log('Creating invoice in Xero:', JSON.stringify(invoiceBody));

    const invRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-Tenant-Id': tenant_id,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ Invoices: [invoiceBody] }),
    });

    const responseText = await invRes.text();
    console.log('Xero API response status:', invRes.status, 'body:', responseText);

    if (!invRes.ok) {
      throw new Error(`Xero invoice creation failed [${invRes.status}]: ${responseText}`);
    }

    const invData = JSON.parse(responseText);
    const invoice = invData?.Invoices?.[0];
    const xeroInvoiceId = invoice?.InvoiceID;

    // Update job or quote with invoice info
    if (job_id) {
      await supabase.from('jobs').update({
        xero_invoice_id: xeroInvoiceId,
        xero_invoice_number: invoiceNumber,
        invoice_status: 'draft',
        invoice_amount: unitAmount,
      }).eq('id', job_id);
    }

    if (quote_id) {
      await supabase.from('quotes').update({
        xero_invoice_id: xeroInvoiceId,
      }).eq('id', quote_id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      invoice_id: xeroInvoiceId, 
      invoice_number: invoiceNumber 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Create invoice error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
