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

    let manualJobId: string | null = null;
    let manualType: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        manualJobId = body.job_id || null;
        manualType = body.type || null;
      } catch { /* scheduled call with no body */ }
    }

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
    const ratingDelayHours = parseFloat(settingsMap['review_sms_delay_hours'] || '2');

    const results: any[] = [];
    const now = new Date();
    const ratingCutoff = new Date(now.getTime() - ratingDelayHours * 60 * 60 * 1000).toISOString();

    // ─── FEEDBACK RATING SMS (2h after completion) ───
    {
      let query = supabase
        .from('jobs')
        .select('id, scheduled_date, property_id, clock_off, properties(property_name, client_name)')
        .eq('status', 'complete')
        .is('feedback_rating_sms_sent_at', null)
        .not('clock_off', 'is', null);

      if (manualJobId && manualType === 'rating') {
        query = query.eq('id', manualJobId);
      } else if (!manualJobId) {
        // Only jobs completed at least ratingDelayHours ago
        query = query.lte('clock_off', ratingCutoff);
      }

      const { data: ratingJobs } = await query.limit(50);

      for (const job of (ratingJobs || [])) {
        const property = (job as any).properties;
        if (!property?.client_name) continue;

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

        const firstName = (profile.full_name || property.client_name || 'there').split(' ')[0];
        const message = `Hi ${firstName}, how was your Brightly clean today? Reply 1-5 to rate us ⭐`;

        const smsResult = await sendTwilioSms(formatAuPhone(profile.phone), message);

        if (smsResult.success) {
          await supabase.from('jobs').update({ feedback_rating_sms_sent_at: now.toISOString() }).eq('id', job.id);
          results.push({ job_id: job.id, type: 'rating', status: 'sent' });
        } else {
          results.push({ job_id: job.id, type: 'rating', status: 'failed', error: smsResult.error });
        }
      }
    }

    // ─── REBOOK SMS (one-off jobs, 24h+ after completion) ───
    if (notifMap['send_rebook_sms'] !== false) {
      let rebookQuery = supabase
        .from('jobs')
        .select('id, scheduled_date, property_id, series_id, properties(property_name, client_name)')
        .eq('status', 'complete')
        .is('rebook_sms_sent_at', null)
        .is('series_id', null);

      if (manualJobId && manualType === 'rebook') {
        rebookQuery = supabase
          .from('jobs')
          .select('id, scheduled_date, property_id, series_id, properties(property_name, client_name)')
          .eq('id', manualJobId)
          .is('rebook_sms_sent_at', null);
      }

      const { data: rebookJobs } = await rebookQuery.limit(50);

      for (const job of (rebookJobs || [])) {
        if ((job as any).series_id) continue;
        const property = (job as any).properties;
        if (!property?.client_name) continue;

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

        const firstName = (profile.full_name || property.client_name || 'there').split(' ')[0];
        const portalToken = clientProps[0].portal_token || '';
        const rebookUrl = `https://app.brightly.cleaning/quote/rebook/${portalToken}`;
        const message = `Hi ${firstName}, hope you're loving the clean! 🏡\n\nReady to book your next one? It's quick and easy: ${rebookUrl}\n\n— The Brightly Team`;

        const smsResult = await sendTwilioSms(formatAuPhone(profile.phone), message);

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
