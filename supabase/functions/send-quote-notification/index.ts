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

async function sendTwilioSms(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Twilio error:', JSON.stringify(data));
    return { success: false, error: data.message || 'SMS failed' };
  }
  return { success: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type } = body;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ─── Send quote link SMS to client ───
    if (type === 'send_link') {
      const { to, first_name, link } = body;
      const message = `Hi ${first_name}, thanks for reaching out to Brightly Cleaning! Fill out your clean details here and we'll get a quote back to you ASAP: ${link}`;
      const result = await sendTwilioSms(formatAuPhone(to), message);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Send quote SMS (new professional quote link) ───
    if (type === 'send_quote_sms') {
      const { to, first_name, quote_url } = body;
      const message = `Hi ${first_name}, your Brightly Cleaning quote is ready.\n\nView and accept here: ${quote_url}\n\nValid for 48 hours. Questions? 0418 878 707\n\n— Brightly Cleaning 🌿`;
      const result = await sendTwilioSms(formatAuPhone(to), message);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Legacy send_quote (residential quote request flow) ───
    if (type === 'send_quote') {
      const { to, first_name, clean_type, address, preferred_date, addons, total_inc_gst, accept_link, company_phone } = body;
      let dateStr = preferred_date || 'TBC';
      try {
        const d = new Date(preferred_date + 'T00:00:00');
        dateStr = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
      } catch { /* use raw */ }
      
      const addonLines = (addons || []).map((a: any) => `• ${a.name} +$${Number(a.price).toFixed(2)}`).join('\n');
      const message = `Hi ${first_name}, your Brightly Cleaning quote is ready!\n\n${clean_type} at ${address}\nDate: ${dateStr}\n${addonLines ? addonLines + '\n' : ''}──────────────\nTotal: $${Number(total_inc_gst).toFixed(2)} inc GST\n\nTo confirm your booking, reply YES or tap here: ${accept_link}\n\nQuote valid for 24 hours.${company_phone ? ` Questions? Call ${company_phone}.` : ''}`;
      
      const result = await sendTwilioSms(formatAuPhone(to), message);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Quote accepted notification ───
    if (type === 'quote_accepted') {
      const { client_name, clean_type, address, job_id } = body;
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');

      // Get app URL from settings
      const { data: appUrlSetting } = await supabase.from('app_settings').select('value').eq('key', 'app_url').maybeSingle();
      const appUrl = appUrlSetting?.value || 'https://brighten-clean-flow.lovable.app';
      const jobUrl = job_id ? `${appUrl}/jobs/${job_id}` : appUrl;

      for (const admin of (admins || [])) {
        // Bell notification
        await supabase.from('notifications').insert({
          user_id: admin.user_id,
          type: 'quote',
          title: 'Quote Accepted',
          message: `Quote accepted — ${client_name || 'Client'}. Assign cleaner and confirm date.`,
          link: job_id ? `/jobs/${job_id}` : '/schedule',
        });

        // Admin SMS
        const { data: profile } = await supabase.from('profiles').select('phone').eq('id', admin.user_id).single();
        if (profile?.phone) {
          const sms = `${client_name || 'A client'} accepted their quote for ${clean_type || 'a clean'} at ${address || 'property'}.\nConfirm date + cleaner in Brightly: ${jobUrl}`;
          await sendTwilioSms(formatAuPhone(profile.phone), sms);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Quote declined notification ───
    if (type === 'quote_declined') {
      const { client_name, clean_type } = body;
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');

      for (const admin of (admins || [])) {
        await supabase.from('notifications').insert({
          user_id: admin.user_id,
          type: 'quote',
          title: 'Quote Declined',
          message: `${client_name || 'A client'} declined their quote${clean_type ? ` for ${clean_type}` : ''}.`,
          link: '/quoting',
        });

        const { data: profile } = await supabase.from('profiles').select('phone').eq('id', admin.user_id).single();
        if (profile?.phone) {
          await sendTwilioSms(formatAuPhone(profile.phone), `${client_name || 'A client'} declined their quote.`);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Legacy: accepted (quote_requests flow) ───
    if (type === 'accepted') {
      const { token, first_name, preferred_date } = body;
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      
      for (const admin of (admins || [])) {
        await supabase.from('notifications').insert({
          user_id: admin.user_id,
          type: 'quote',
          title: 'Quote Accepted',
          message: `${first_name} accepted their quote — job created for ${preferred_date || 'TBC'}. Assign a cleaner.`,
          link: '/clients',
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Default: form submitted notification to admin ───
    const { token: qToken, first_name, last_name, bedrooms, bathrooms, clean_type, address } = body;
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');

    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.user_id,
        type: 'quote',
        title: 'New Quote Request',
        message: `Quote request from ${first_name} ${last_name || ''} — ${bedrooms}bd/${bathrooms}ba ${clean_type} at ${address}`,
        link: '/clients',
      });

      const { data: profile } = await supabase.from('profiles').select('phone').eq('id', admin.user_id).single();
      if (profile?.phone) {
        await sendTwilioSms(formatAuPhone(profile.phone), `New quote request from ${first_name} — ${bedrooms}bd/${bathrooms}ba ${clean_type} at ${address}. Open Brightly to quote.`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-quote-notification error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
