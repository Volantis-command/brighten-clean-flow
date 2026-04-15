import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { xero_invoice_id } = await req.json();
    if (!xero_invoice_id) {
      return new Response(JSON.stringify({ error: 'Missing xero_invoice_id' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: tokens } = await supabase.from('xero_tokens').select('*').limit(1).single();
    if (!tokens) throw new Error('Xero not connected');

    const res = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${xero_invoice_id}`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Xero-Tenant-Id': tokens.tenant_id,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to get invoice [${res.status}]: ${errText}`);
    }

    const data = await res.json();
    const invoice = data?.Invoices?.[0];
    const status = invoice?.Status?.toLowerCase() || 'unknown';

    // Map Xero status to our status
    const statusMap: Record<string, string> = {
      draft: 'draft',
      submitted: 'sent',
      authorised: 'sent',
      paid: 'paid',
      voided: 'none',
      deleted: 'none',
    };

    return new Response(JSON.stringify({ 
      status: statusMap[status] || status,
      xero_status: invoice?.Status,
      amount_due: invoice?.AmountDue,
      total: invoice?.Total,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Get invoice status error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
