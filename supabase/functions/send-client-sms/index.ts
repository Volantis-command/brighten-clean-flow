import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { job_id, message } = await req.json();
    if (!job_id || !message) throw new Error('job_id and message are required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Lookup client phone via job → property → client_properties → profile
    const { data: job } = await supabase
      .from('jobs')
      .select('property_id')
      .eq('id', job_id)
      .maybeSingle();
    if (!job?.property_id) throw new Error('Job or property not found');

    const { data: cp } = await supabase
      .from('client_properties')
      .select('client_id')
      .eq('property_id', job.property_id)
      .limit(1);
    if (!cp?.length) throw new Error('No client linked');

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', cp[0].client_id)
      .maybeSingle();
    if (!profile?.phone) throw new Error('Client has no phone');

    let phone = (profile.phone || '').replace(/[\s\-()]/g, '');
    if (phone.startsWith('0')) phone = '+61' + phone.slice(1);
    else if (!phone.startsWith('+')) phone = '+61' + phone;

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioSid || !twilioAuth || !twilioPhone) {
      return new Response(JSON.stringify({ success: false, reason: 'no_twilio' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: twilioPhone, Body: message }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-client-sms error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
