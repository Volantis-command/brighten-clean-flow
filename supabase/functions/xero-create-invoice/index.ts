import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getValidToken(supabase: any) {
  const { data: tokens } = await supabase.from('xero_tokens').select('*').limit(1).single();
  if (!tokens) throw new Error('Xero not connected');

  // Auto-refresh if needed
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
    const { job_id, quote_id, contact_name, description, amount, account_code, invoice_prefix, due_days } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { access_token, tenant_id } = await getValidToken(supabase);

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
    const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).neq('xero_invoice_number', null);
    const seq = String((count || 0) + 1).padStart(3, '0');
    const invoiceNumber = `${prefix}${new Date().getFullYear()}-${seq}`;

    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + (parseInt(due_days) || 7));

    const invoiceBody: any = {
      Type: 'ACCREC',
      InvoiceNumber: invoiceNumber,
      Reference: invoiceNumber,
      Date: today.toISOString().split('T')[0],
      DueDate: dueDate.toISOString().split('T')[0],
      Status: 'DRAFT',
      LineAmountTypes: 'Inclusive',
      LineItems: [{
        Description: description || 'Cleaning service',
        Quantity: 1,
        UnitAmount: amount || 0,
        AccountCode: account_code || '4000',
        TaxType: 'OUTPUT',
      }],
    };

    if (contactId) {
      invoiceBody.Contact = { ContactID: contactId };
    }

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

    if (!invRes.ok) {
      const errText = await invRes.text();
      throw new Error(`Xero invoice creation failed [${invRes.status}]: ${errText}`);
    }

    const invData = await invRes.json();
    const invoice = invData?.Invoices?.[0];
    const xeroInvoiceId = invoice?.InvoiceID;

    // Update job or quote with invoice info
    if (job_id) {
      await supabase.from('jobs').update({
        xero_invoice_id: xeroInvoiceId,
        xero_invoice_number: invoiceNumber,
        invoice_status: 'draft',
        invoice_amount: amount || 0,
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
