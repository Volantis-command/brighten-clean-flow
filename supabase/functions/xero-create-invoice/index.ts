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

    // If only job_id was passed, hydrate contact/amount/description from the job
    if (job_id && (!contact_name || amount === undefined || amount === null)) {
      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_ex_gst, price_inc_gst, client_name, property_id, properties:property_id(property_name, address, billing_email, client_name)')
        .eq('id', job_id)
        .single();
      if (jobErr || !job) {
        throw new Error(`Job lookup failed: ${jobErr?.message || 'not found'}`);
      }
      const prop: any = (job as any).properties || {};
      contact_name = contact_name || prop.client_name || (job as any).client_name || prop.property_name || 'Client';
      const ex = Number((job as any).price_ex_gst || 0);
      const inc = Number((job as any).price_inc_gst || 0);
      const fallbackEx = ex > 0 ? ex : (inc > 0 ? +(inc / 1.1).toFixed(2) : 0);
      if (amount === undefined || amount === null) amount = fallbackEx;
      const dateLabel = (job as any).scheduled_date || '';
      description = description || `Cleaning service${prop.property_name ? ` — ${prop.property_name}` : ''}${dateLabel ? ` (${dateLabel})` : ''}`;
    }

    if (!contact_name) {
      throw new Error('contact_name is required (no client name found on job/property)');
    }
    if (!amount || Number(amount) <= 0) {
      throw new Error(`Invalid invoice amount: ${amount}. Job must have price_ex_gst or price_inc_gst set.`);
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
      } else {
        const createRes = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Xero-Tenant-Id': tenant_id,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ Contacts: [{ Name: contact_name }] }),
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
