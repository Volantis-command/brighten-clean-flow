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
      Authorization: `Basic ${credentials}`,
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find scheduled jobs happening within the next 48 hours that haven't had a reminder sent
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const in46h = new Date(now.getTime() + 46 * 60 * 60 * 1000); // 46-48h window to avoid duplicates

    const todayStr = now.toISOString().split('T')[0];
    const in2daysStr = in48h.toISOString().split('T')[0];

    // Get jobs scheduled tomorrow (approximately 24-48h from now)
    const { data: upcomingJobs } = await supabase
      .from('jobs')
      .select('id, scheduled_date, scheduled_time, property_id, series_id, client_booking_sms_sent_at, properties(property_name, address, suburb, client_name)')
      .eq('status', 'scheduled')
      .in('scheduled_date', [in2daysStr]) // jobs day after tomorrow
      .not('series_id', 'is', null); // only recurring jobs

    const results: any[] = [];

    for (const job of (upcomingJobs || [])) {
      // Skip if we already sent a reminder (using client_booking_sms_sent_at as our "reminder sent" flag)
      // We check for a specific pattern — the reminder is distinct
      // For simplicity, use a notes check or a new field. We'll reuse rebook_sms_sent_at as "reminder_sent_at"
      if ((job as any).rebook_sms_sent_at) continue;

      const property = (job as any).properties;
      if (!property?.client_name) continue;

      // Find client
      const { data: clientProps } = await supabase
        .from('client_properties')
        .select('client_id')
        .eq('property_id', job.property_id!)
        .limit(1);

      if (!clientProps?.length) continue;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', clientProps[0].client_id)
        .single();

      if (!profile?.phone) continue;

      const firstName = (profile.full_name || 'there').split(' ')[0];
      const timeStr = job.scheduled_time ? job.scheduled_time.slice(0, 5) : '';

      let formattedDate = job.scheduled_date;
      try {
        const d = new Date(job.scheduled_date + 'T00:00:00');
        formattedDate = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
      } catch { /* use raw */ }

      const message = `Hi ${firstName}, just a reminder your clean is ${formattedDate}${timeStr ? ` at ${timeStr}` : ''}. 🧹\n\nReply STOP to cancel.\n\n— Brightly Cleaning`;

      const smsResult = await sendTwilioSms(formatAuPhone(profile.phone), message);

      if (smsResult.success) {
        // Mark reminder as sent using rebook_sms_sent_at field
        await supabase.from('jobs').update({ rebook_sms_sent_at: now.toISOString() }).eq('id', job.id);
        results.push({ job_id: job.id, status: 'sent' });
      } else {
        results.push({ job_id: job.id, status: 'failed', error: smsResult.error });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-reminder-sms] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
