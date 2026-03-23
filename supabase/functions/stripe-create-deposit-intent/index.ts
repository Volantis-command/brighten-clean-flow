import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token, deposit_amount } = await req.json();
    if (!token || !deposit_amount) throw new Error('Missing token or deposit_amount');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get quote request
    const { data: quote, error: qErr } = await supabase
      .from('quote_requests')
      .select('*')
      .eq('token', token)
      .single();
    if (qErr || !quote) throw new Error('Quote not found');
    if (quote.deposit_paid) throw new Error('Deposit already paid');

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    const amountCents = Math.round(parseFloat(deposit_amount) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      metadata: {
        quote_token: token,
        quote_id: quote.id,
        client_name: `${quote.first_name || ''} ${quote.last_name || ''}`.trim(),
      },
      automatic_payment_methods: { enabled: true },
    });

    return new Response(JSON.stringify({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('stripe-create-deposit-intent error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
