import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatAuPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+61')) return cleaned;
  if (cleaned.startsWith('61') && cleaned.length >= 11) return '+' + cleaned;
  if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);
  return '+61' + cleaned;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      client_name, client_phone, client_email,
      property_name, property_address,
      bedrooms, bathrooms, bed_types,
      labour_cost, linen_cost, consumables_cost,
      gp_percent, sell_price_ex_gst, sell_price_inc_gst,
      hours, notes, linen_required, clean_type,
    } = body;
    const cleanType = clean_type || 'Airbnb Turnover';

    if (!client_name || !client_phone) {
      return new Response(JSON.stringify({ error: 'client_name and client_phone required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const quote_token = crypto.randomUUID();
    const total_cost = (labour_cost || 0) + (linen_cost || 0) + (consumables_cost || 0);

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        client_name,
        client_phone,
        client_email: client_email || null,
        property_name: property_name || null,
        property_address: property_address || null,
        bedrooms: bedrooms || null,
        bathrooms: bathrooms || null,
        bed_types: bed_types || null,
        labour_cost: labour_cost || 0,
        linen_cost: linen_cost || 0,
        consumables_cost: consumables_cost || 0,
        total_cost,
        gp_percent: gp_percent || 0.35,
        sell_price_ex_gst: sell_price_ex_gst || 0,
        gst: (sell_price_ex_gst || 0) * 0.1,
        sell_price_inc_gst: sell_price_inc_gst || 0,
        actual_gp_dollars: (sell_price_ex_gst || 0) - total_cost,
        actual_gp_percent: gp_percent || 0.35,
        hours: hours || null,
        notes: notes || null,
        clean_type: cleanType,
        service_type: cleanType,
        linen_required: linen_required ?? (linen_cost > 0),
        status: 'sent',
        quote_token,
        quote_sent_at: new Date().toISOString(),
      })
      .select('id, quote_token')
      .single();

    if (quoteError || !quote) throw new Error(quoteError?.message || 'Failed to create quote');

    const quoteUrl = `https://app.brightly.cleaning/quote-view/${quote.quote_token}`;
    const firstName = client_name.split(' ')[0];
    const smsBody = `Hi ${firstName} 👋 Your Brightly quote is ready — tap to view & accept:\n${quoteUrl}\n\nQuestions? Call 0418 878 707`;

    const formattedPhone = formatAuPhone(client_phone);
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

    const smsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: formattedPhone, From: fromNumber, Body: smsBody }),
      }
    );

    const smsData = await smsRes.json();
    const smsSent = smsRes.ok;
    if (!smsSent) console.error('SMS error:', smsData);

    return new Response(JSON.stringify({
      success: true,
      quote_id: quote.id,
      quote_token: quote.quote_token,
      quote_url: quoteUrl,
      sms_sent: smsSent,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
