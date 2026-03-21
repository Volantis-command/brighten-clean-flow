import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendTwilioSms(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
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
  return { success: true, sid: data.sid };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { job_id } = await req.json();
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
      .select('*, properties(property_name, suburb)')
      .eq('id', job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: corsHeaders });
    }

    const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean);
    if (cleanerIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No cleaners assigned' }), { status: 400, headers: corsHeaders });
    }

    // Fetch cleaner profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', cleanerIds);

    const property = job.properties as any;
    const propName = property?.property_name || 'a property';
    const suburb = property?.suburb || '';

    // Format date nicely
    const dateStr = job.scheduled_date;
    const timeStr = job.scheduled_time?.slice(0, 5) || '';
    let formattedDate = dateStr;
    try {
      const d = new Date(dateStr + 'T00:00:00');
      formattedDate = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { /* use raw */ }

    const results: Array<{ cleaner_id: string; status: string; error?: string }> = [];

    for (const profile of (profiles || [])) {
      const firstName = (profile.full_name || 'Team member').split(' ')[0];

      if (!profile.phone) {
        // Create acceptance record with no SMS
        await supabase.from('job_acceptances').upsert({
          job_id,
          cleaner_id: profile.id,
          acceptance_status: 'no_phone',
        }, { onConflict: 'job_id,cleaner_id' });

        results.push({ cleaner_id: profile.id, status: 'no_phone' });
        continue;
      }

      const message = `Hi ${firstName}, you have a new Brightly job:\n\n📅 ${formattedDate} at ${timeStr}\n📍 ${propName}, ${suburb}\n\nReply YES to accept or NO to decline.\n\n- Brightly`;

      const smsResult = await sendTwilioSms(profile.phone, message);

      // Upsert acceptance record
      await supabase.from('job_acceptances').upsert({
        job_id,
        cleaner_id: profile.id,
        acceptance_status: 'pending',
        sms_sent_at: new Date().toISOString(),
      }, { onConflict: 'job_id,cleaner_id' });

      results.push({
        cleaner_id: profile.id,
        status: smsResult.success ? 'sent' : 'failed',
        error: smsResult.error,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-job-sms error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
