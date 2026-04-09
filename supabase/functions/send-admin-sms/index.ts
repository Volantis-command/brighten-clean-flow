import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { message } = await req.json();
    if (!message) throw new Error('message is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get admin/director phone numbers
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin']);

    if (!adminRoles?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminIds = adminRoles.map((r: any) => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('phone')
      .in('id', adminIds)
      .not('phone', 'is', null);

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioSid || !twilioAuth || !twilioPhone || !profiles?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: 'no_twilio_or_no_phones' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    for (const p of profiles) {
      let phone = (p.phone || '').replace(/[\s\-()]/g, '');
      if (phone.startsWith('0')) phone = '+61' + phone.slice(1);
      else if (!phone.startsWith('+')) phone = '+61' + phone;

      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: twilioPhone, Body: message }),
      });
      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-admin-sms error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
