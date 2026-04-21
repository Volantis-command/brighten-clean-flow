import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://app.brightly.cleaning';

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

function addWeeksToDate(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
}

function formatDateNice(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return dateStr;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const { job_id } = body;
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch job with property
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('*, properties(property_name, address, suburb, client_name)')
      .eq('id', job_id)
      .single();

    if (jobErr || !job) {
      console.error('[job-completed-sms] Job not found:', jobErr);
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: corsHeaders });
    }

    const property = (job as any).properties;
    const results: any[] = [];

    // Find client via client_properties
    const { data: clientProps } = await supabase
      .from('client_properties')
      .select('client_id, portal_token')
      .eq('property_id', job.property_id!)
      .limit(1);

    if (!clientProps?.length) {
      console.log('[job-completed-sms] No client_properties found for property');
      return new Response(JSON.stringify({ success: true, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: clientProfile } = await supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', clientProps[0].client_id)
      .single();

    if (!clientProfile?.phone) {
      console.log('[job-completed-sms] No client phone found');
      return new Response(JSON.stringify({ success: true, results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const firstName = (clientProfile.full_name || 'there').split(' ')[0];
    const portalToken = clientProps[0].portal_token || '';
    const propertyAddress = [property?.address, property?.suburb].filter(Boolean).join(', ') || property?.property_name || 'your property';

    // Check if this job is part of a recurring series
    const isRecurring = !!job.series_id;
    let nextDateStr = '';

    if (isRecurring && job.series_id) {
      // Get series config
      const { data: series } = await supabase
        .from('job_series')
        .select('*')
        .eq('id', job.series_id)
        .single();

      if (series) {
        const intervalWeeks = series.interval_weeks || 1;
        nextDateStr = addWeeksToDate(job.scheduled_date, intervalWeeks);

        // Check if end_date allows it
        const withinRange = !series.end_date || nextDateStr <= series.end_date;

        if (withinRange) {
          // Check if next job already exists
          const { data: existingNext } = await supabase
            .from('jobs')
            .select('id')
            .eq('property_id', job.property_id!)
            .eq('scheduled_date', nextDateStr)
            .eq('series_id', job.series_id)
            .limit(1);

          if (!existingNext?.length) {
            // Create next recurring job
            const { error: insertErr } = await supabase.from('jobs').insert({
              property_id: job.property_id,
              scheduled_date: nextDateStr,
              scheduled_time: job.scheduled_time,
              cleaner_1_id: job.cleaner_1_id,
              cleaner_2_id: job.cleaner_2_id,
              status: 'scheduled',
              series_id: job.series_id,
              price_ex_gst: job.price_ex_gst,
              price_inc_gst: job.price_inc_gst,
              notes: job.notes,
              source: 'recurring',
            });

            if (insertErr) {
              console.error('[job-completed-sms] Failed to create next recurring job:', insertErr);
            } else {
              console.log(`[job-completed-sms] Created next recurring job for ${nextDateStr}`);
              results.push({ type: 'recurring_job_created', date: nextDateStr });
            }
          }
        }
      }

      // Send completion SMS with next date
      const formattedNext = formatDateNice(nextDateStr);
      const message = `Hi ${firstName}, your clean is done! 🌿✨\n\nWe hope everything looks amazing.\n\nYour next clean is scheduled for ${formattedNext}. We'll be in touch to confirm.\n\n— Brightly Cleaning`;
      const smsResult = await sendTwilioSms(formatAuPhone(clientProfile.phone), message);
      results.push({ type: 'completion_sms', recurring: true, status: smsResult.success ? 'sent' : 'failed' });
    } else {
      // One-off: send completion SMS with rebook link
      const rebookUrl = `${APP_URL}/client/${portalToken}/rebook`;
      const message = `Hi ${firstName}, your clean is done! 🌿✨\n\nWe hope everything looks amazing.\n\nReady to book your next clean?\n\n👉 ${rebookUrl}\n\n— Brightly Cleaning`;
      const smsResult = await sendTwilioSms(formatAuPhone(clientProfile.phone), message);
      results.push({ type: 'completion_sms', recurring: false, status: smsResult.success ? 'sent' : 'failed' });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[job-completed-sms] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
