import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MIN_TIP_CENTS = 100;     // $1
const MAX_TIP_CENTS = 50_000;  // $500 — paranoia cap

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { token, job_id, amount_cents, success_url, cancel_url } = await req.json();
    if (!token || !job_id || !amount_cents) {
      return new Response(JSON.stringify({ error: 'token, job_id, amount_cents required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const cents = Math.round(Number(amount_cents));
    if (!Number.isFinite(cents) || cents < MIN_TIP_CENTS || cents > MAX_TIP_CENTS) {
      return new Response(JSON.stringify({ error: `amount must be between $${MIN_TIP_CENTS / 100} and $${MAX_TIP_CENTS / 100}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe is not configured yet — ask admin to set STRIPE_SECRET_KEY.' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Token → client → ownership of the job's property.
    const { data: tokenRow } = await supabase
      .from('client_properties').select('client_id')
      .eq('portal_token', token).eq('portal_active', true).maybeSingle();
    if (!tokenRow) {
      return new Response(JSON.stringify({ error: 'invalid or inactive portal link' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: job } = await supabase
      .from('jobs')
      .select('id, property_id, cleaner_1_id, status')
      .eq('id', job_id).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: 'job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!['completed', 'complete'].includes(job.status)) {
      return new Response(JSON.stringify({ error: 'tipping is only available on completed cleans' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: ownership } = await supabase
      .from('client_properties').select('id')
      .eq('client_id', tokenRow.client_id).eq('property_id', job.property_id).eq('portal_active', true)
      .maybeSingle();
    if (!ownership) {
      return new Response(JSON.stringify({ error: 'you do not own this property' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: cleaner } = job.cleaner_1_id
      ? await supabase.from('profiles').select('full_name').eq('id', job.cleaner_1_id).maybeSingle()
      : { data: null };
    const cleanerName = (cleaner as any)?.full_name || 'your cleaner';

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'aud',
          unit_amount: cents,
          product_data: {
            name: `Tip for ${cleanerName}`,
            description: 'Tips go to the cleaner who looked after your property.',
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: success_url || 'https://app.brightly.cleaning/',
      cancel_url: cancel_url || 'https://app.brightly.cleaning/',
      metadata: {
        kind: 'cleaner_tip',
        job_id,
        cleaner_id: job.cleaner_1_id || '',
        client_id: tokenRow.client_id,
        property_id: job.property_id || '',
      },
    });

    // Record the pending tip — webhook flips to 'paid' on success.
    await supabase.from('cleaner_tips').insert({
      job_id,
      property_id: job.property_id,
      cleaner_id: job.cleaner_1_id,
      client_id: tokenRow.client_id,
      amount_cents: cents,
      currency: 'aud',
      status: 'pending',
      stripe_session_id: session.id,
    });

    return new Response(JSON.stringify({ checkout_url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
