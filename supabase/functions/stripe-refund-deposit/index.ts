import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ── Admin gate: refunds move real money, so require a valid admin JWT.
    // (Previously this endpoint was callable by anyone holding the anon key.)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { job_id, reason } = await req.json();
    if (!job_id) throw new Error('Missing job_id');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: job, error: jErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job_id)
      .single();
    if (jErr || !job) throw new Error('Job not found');
    if (!job.stripe_payment_intent_id) throw new Error('No payment intent on this job');
    if (job.deposit_refunded) throw new Error('Already refunded');

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    await stripe.refunds.create({
      payment_intent: job.stripe_payment_intent_id,
      reason: 'requested_by_customer',
    });

    await supabase.from('jobs').update({
      deposit_refunded: true,
      deposit_refund_reason: reason || 'Admin initiated refund',
    }).eq('id', job_id);

    // Send refund SMS if client phone available
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (twilioSid && twilioToken && twilioPhone && job.notes) {
      // Try to extract phone from notes or quote_requests
      const { data: quotes } = await supabase
        .from('quote_requests')
        .select('phone, first_name')
        .eq('stripe_payment_intent_id', job.stripe_payment_intent_id)
        .limit(1);

      const quote = quotes?.[0];
      if (quote?.phone) {
        const depositAmount = Number(job.deposit_amount || 0).toFixed(2);
        const smsBody = `Your Brightly Cleaning deposit of $${depositAmount} has been refunded. It will appear in 2–5 business days.`;

        const formData = new URLSearchParams();
        formData.append('To', quote.phone);
        formData.append('From', twilioPhone);
        formData.append('Body', smsBody);

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('stripe-refund-deposit error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
