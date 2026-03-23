import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatAuPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+61')) return cleaned;
  if (cleaned.startsWith('61') && cleaned.length >= 11) return '+' + cleaned;
  if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);
  return '+61' + cleaned;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'Missing client_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('id', client_id)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.phone) {
      return new Response(JSON.stringify({ error: 'No phone number on file. Please edit the client and add a mobile number first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = client_id;

    // Ensure a client_properties row exists with onboard_token set
    const { data: existing } = await supabase
      .from('client_properties')
      .select('id')
      .eq('client_id', client_id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('client_properties')
        .update({
          onboard_token: token,
          onboard_used: false,
          onboarding_sent_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Create a placeholder client_properties row (no property yet — client will fill it in)
      // We need a property_id — create a placeholder property
      const { data: prop } = await supabase
        .from('properties')
        .insert({
          property_name: `${profile.full_name || 'New'} - Pending Onboarding`,
          client_name: profile.full_name,
          status: 'onboarding',
        })
        .select('id')
        .single();

      if (prop) {
        await supabase.from('client_properties').insert({
          client_id,
          property_id: prop.id,
          onboard_token: token,
          onboard_used: false,
          onboarding_sent_at: new Date().toISOString(),
        });
      }
    }

    const onboardUrl = `https://brighten-clean-flow.lovable.app/onboard/${token}`;
    const firstName = (profile.full_name || 'there').split(' ')[0];
    const smsBody = `Hi ${firstName}, welcome to Brightly Cleaning! Please fill out your property details here — it only takes a few minutes: ${onboardUrl}`;

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in secrets.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const toFormatted = formatAuPhone(profile.phone);
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const smsRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toFormatted, From: fromNumber, Body: smsBody }),
    });

    const smsData = await smsRes.json();
    if (!smsRes.ok) {
      console.error('Twilio error:', JSON.stringify(smsData));
      return new Response(JSON.stringify({ error: `SMS failed: ${smsData.message || JSON.stringify(smsData)}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      name: profile.full_name,
      sid: smsData.sid,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-onboarding-sms error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
