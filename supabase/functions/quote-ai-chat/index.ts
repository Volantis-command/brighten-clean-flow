import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a friendly assistant for Brightly Cleaning, a premium Airbnb turnover cleaning company on the Gold Coast, Australia.

You help clients understand their quote and our services. Keep responses warm, concise, and under 80 words. Write in natural sentences — no bullet points.

Key facts:
- Every clean includes full linen changeover (sheets, towels, bath mats, tea towels)
- Photo report sent after every single clean — timestamped proof of condition
- Consumables restocked each clean (soap, shampoo, toilet paper, coffee/tea)
- All cleaners police checked and fully insured
- We schedule around guest checkouts — no disruption to your bookings
- Works with Airbnb, Stayz, VRBO, direct bookings
- Gold Coast and surrounds
- Contact BJ directly: 0418 878 707

If asked to negotiate price, say the quote reflects our standard rate but to call 0418 878 707 to discuss. If unsure about something, say the team will follow up.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { quote_token, message, history = [] } = await req.json();

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'message required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load quote context
    let quoteContext = '';
    let quoteId: string | null = null;
    if (quote_token) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('id, client_name, property_name, property_address, bedrooms, bathrooms, sell_price_inc_gst, hours, linen_required, consumables_cost, linen_cost')
        .eq('quote_token', quote_token)
        .single();

      if (quote) {
        quoteId = quote.id;
        const linen = Number(quote.linen_cost || 0) > 0;
        const consumables = Number(quote.consumables_cost || 0) > 0;
        quoteContext = `

Quote context for this client:
- Property: ${quote.property_name || quote.property_address || 'Not specified'}
- Size: ${quote.bedrooms || '?'} bed / ${quote.bathrooms || '?'} bath
- Price: $${Number(quote.sell_price_inc_gst || 0).toFixed(2)} inc GST per clean
- Estimated time: ~${quote.hours || '?'} hrs
- Linen service: ${linen || quote.linen_required ? 'Included' : 'Not included in this quote'}
- Consumables: ${consumables ? 'Included' : 'Not included in this quote'}`;
      }
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      // Graceful fallback — store the message and tell client team will follow up
      if (quoteId && message) {
        await supabase.from('quote_messages').insert({
          quote_id: quoteId,
          quote_token,
          message: message.trim(),
          direction: 'inbound',
        }).catch(() => {});
      }
      return new Response(JSON.stringify({
        response: "Thanks for your question! Our team will get back to you shortly. Or call BJ directly on 0418 878 707 — he's usually quick to reply.",
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Store the inbound message
    if (quoteId) {
      await supabase.from('quote_messages').insert({
        quote_id: quoteId,
        quote_token,
        message: message.trim(),
        direction: 'inbound',
      }).catch(() => {});
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: SYSTEM_PROMPT + quoteContext,
        messages: [
          ...history.slice(-6), // last 3 turns for context
          { role: 'user', content: message.trim() },
        ],
      }),
    });

    const aiData = await res.json();
    const response = aiData.content?.[0]?.text
      || "Thanks for your question — our team will follow up shortly. Or call 0418 878 707 for an instant answer.";

    // Store AI response
    if (quoteId) {
      await supabase.from('quote_messages').insert({
        quote_id: quoteId,
        quote_token,
        message: response,
        direction: 'outbound',
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ response }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('quote-ai-chat error:', err);
    return new Response(JSON.stringify({
      response: "Sorry, something went wrong. Call us on 0418 878 707 and we'll sort it out straight away.",
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
