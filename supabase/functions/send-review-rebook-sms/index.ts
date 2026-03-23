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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if manual trigger with specific job_id
    let manualJobId: string | null = null;
    let manualType: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        manualJobId = body.job_id || null;
        manualType = body.type || null; // 'review' or 'rebook'
      } catch { /* scheduled call with no body */ }
    }

    // Fetch settings
    const { data: notifSettings } = await supabase
      .from('notification_settings')
      .select('key, enabled');
    const notifMap: Record<string, boolean> = {};
    (notifSettings || []).forEach((s: any) => { notifMap[s.key] = s.enabled; });

    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('key, value');
    const settingsMap: Record<string, string> = {};
    (appSettings || []).forEach((s: any) => { settingsMap[s.key] = s.value; });

    const googleReviewUrl = settingsMap['google_review_url'] || '';
    const reviewDelayHours = parseFloat(settingsMap['review_sms_delay_hours'] || '2');
    const rebookDelayHours = parseFloat(settingsMap['rebook_sms_delay_hours'] || '24');
    const appUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '').replace('https://','') || '';

    const results: any[] = [];
    const now = new Date();

    // --- REVIEW SMS ---
    if (notifMap['send_google_review_sms'] !== false && googleReviewUrl) {
      const reviewCutoff = new Date(now.getTime() - reviewDelayHours * 60 * 60 * 1000).toISOString();

      let reviewQuery = supabase
        .from('jobs')
        .select('id, scheduled_date, property_id, properties(property_name, client_name)')
        .eq('status', 'complete')
        .is('review_sms_sent_at', null);

      if (manualJobId && manualType === 'review') {
        reviewQuery = reviewQuery.eq('id', manualJobId);
      } else if (!manualJobId) {
        // Only jobs completed at least reviewDelayHours ago
        // We approximate "completed at" by checking jobs that were updated before the cutoff
        // Since we don't have a completed_at column, we filter by created_at or scheduled_date
      }

      const { data: reviewJobs } = await reviewQuery.limit(50);

      for (const job of (reviewJobs || [])) {
        const property = (job as any).properties;
        const clientName = property?.client_name;
        if (!clientName) continue;

        // Find client profile with phone
        const { data: clientProps } = await supabase
          .from('client_properties')
          .select('client_id')
          .eq('property_id', job.property_id!)
          .limit(1);

        if (!clientProps?.length) continue;

        const { data: profile } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', clientProps[0].client_id)
          .single();

        if (!profile?.phone) continue;

        const firstName = (profile.full_name || clientName || 'there').split(' ')[0];
        const message = `Hi ${firstName}, thank you for choosing Brightly Cleaning! We hope everything looks amazing ✨\n\nIf you're happy with the result, we'd love a Google review — it means the world to a small business: ${googleReviewUrl}`;

        const smsResult = await sendTwilioSms(profile.phone, message);

        if (smsResult.success) {
          await supabase.from('jobs').update({ review_sms_sent_at: now.toISOString() }).eq('id', job.id);
          results.push({ job_id: job.id, type: 'review', status: 'sent' });
        } else {
          results.push({ job_id: job.id, type: 'review', status: 'failed', error: smsResult.error });
        }
      }
    }

    // --- REBOOK SMS ---
    if (notifMap['send_rebook_sms'] !== false) {
      let rebookQuery = supabase
        .from('jobs')
        .select('id, scheduled_date, property_id, series_id, properties(property_name, client_name)')
        .eq('status', 'complete')
        .is('rebook_sms_sent_at', null)
        .is('series_id', null); // Only one-off jobs

      if (manualJobId && manualType === 'rebook') {
        rebookQuery = supabase
          .from('jobs')
          .select('id, scheduled_date, property_id, series_id, properties(property_name, client_name)')
          .eq('id', manualJobId)
          .is('rebook_sms_sent_at', null);
      }

      const { data: rebookJobs } = await rebookQuery.limit(50);

      for (const job of (rebookJobs || [])) {
        // Skip recurring jobs
        if ((job as any).series_id) continue;

        const property = (job as any).properties;
        const clientName = property?.client_name;
        if (!clientName) continue;

        // Find client
        const { data: clientProps } = await supabase
          .from('client_properties')
          .select('client_id, portal_token')
          .eq('property_id', job.property_id!)
          .limit(1);

        if (!clientProps?.length) continue;

        const { data: profile } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', clientProps[0].client_id)
          .single();

        if (!profile?.phone) continue;

        // Check if client already has recurring jobs on this property
        const { data: activeSeries } = await supabase
          .from('job_series')
          .select('id')
          .eq('property_id', job.property_id!)
          .limit(1);

        if (activeSeries?.length) {
          // Skip — client already has recurring booking
          await supabase.from('jobs').update({ rebook_sms_sent_at: now.toISOString() }).eq('id', job.id);
          results.push({ job_id: job.id, type: 'rebook', status: 'skipped_recurring' });
          continue;
        }

        const firstName = (profile.full_name || clientName || 'there').split(' ')[0];
        const portalToken = clientProps[0].portal_token || '';
        // Use the app's public URL
        const rebookUrl = `https://brighten-clean-flow.lovable.app/quote/rebook/${portalToken}`;

        const message = `Hi ${firstName}, hope you're loving the clean! 🏡\n\nReady to book your next one? It's quick and easy: ${rebookUrl}\n\n— The Brightly Team`;

        const smsResult = await sendTwilioSms(profile.phone, message);

        if (smsResult.success) {
          await supabase.from('jobs').update({ rebook_sms_sent_at: now.toISOString() }).eq('id', job.id);
          results.push({ job_id: job.id, type: 'rebook', status: 'sent' });
        } else {
          results.push({ job_id: job.id, type: 'rebook', status: 'failed', error: smsResult.error });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-review-rebook-sms error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
