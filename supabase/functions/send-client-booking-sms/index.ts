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
    const { job_id, is_update } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch job with property
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('*, properties(property_name, address, suburb)')
      .eq('id', job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: corsHeaders });
    }

    // Skip if already sent and not an update
    if (!is_update && job.client_booking_sms_sent_at) {
      return new Response(JSON.stringify({ message: 'SMS already sent' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find client linked to this property
    const { data: links } = await supabase
      .from('client_properties')
      .select('client_id')
      .eq('property_id', job.property_id);

    if (!links?.length) {
      return new Response(JSON.stringify({ message: 'No client linked' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientIds = links.map((l: any) => l.client_id);
    const { data: clients } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', clientIds);

    if (!clients?.length) {
      return new Response(JSON.stringify({ message: 'No client profiles' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get cleaner name
    let cleanerName = 'your cleaner';
    if (job.cleaner_1_id) {
      const { data: cleaner } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', job.cleaner_1_id)
        .single();
      if (cleaner?.full_name) {
        cleanerName = cleaner.full_name.split(' ')[0];
      }
    }

    const property = job.properties as any;
    const propAddress = [property?.address, property?.suburb].filter(Boolean).join(', ') || property?.property_name || 'your property';

    // Format date
    let formattedDate = job.scheduled_date;
    try {
      const d = new Date(job.scheduled_date + 'T00:00:00');
      formattedDate = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch { /* use raw */ }

    const timeStr = job.scheduled_time?.slice(0, 5) || '';

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER')!;

    const results: any[] = [];

    for (const client of clients) {
      if (!client.phone) continue;

      const firstName = (client.full_name || 'there').split(' ')[0];

      let body: string;
      if (is_update) {
        body = `Hi ${firstName}, your clean has been updated.\nNew time: ${formattedDate} at ${timeStr}.\nCleaner: ${cleanerName}.\n— Brightly Cleaning`;
      } else {
        body = `Hi ${firstName}, your clean at ${propAddress} is booked for ${formattedDate} at ${timeStr}.\nYour cleaner will be ${cleanerName}.\nQuestions? Reply to this message or call us.\n— Brightly Cleaning 🌿`;
      }

      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
      const resp = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: formatAuPhone(client.phone), From: TWILIO_PHONE, Body: body }),
      });

      const data = await resp.json();
      results.push({ phone: client.phone, success: resp.ok, sid: data.sid, error: data.message });
    }

    // Mark SMS sent
    await supabase.from('jobs').update({ client_booking_sms_sent_at: new Date().toISOString() }).eq('id', job_id);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-client-booking-sms error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
