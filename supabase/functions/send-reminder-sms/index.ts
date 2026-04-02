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

function getJobDateTimeAEST(scheduledDate: string, scheduledTime: string | null): Date {
  const timeStr = scheduledTime ? scheduledTime.slice(0, 5) : '09:00';
  // Parse as AEST (UTC+10)
  const dt = new Date(`${scheduledDate}T${timeStr}:00+10:00`);
  return dt;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Handle reschedule request from client
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.type === 'reschedule_request') {
        const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'business_phone').maybeSingle();
        const adminPhone = settings?.value || Deno.env.get('ADMIN_PHONE');
        if (adminPhone) {
          const msg = `Reschedule request from ${body.client_name || 'Client'} at ${body.address || 'N/A'} on ${body.date || 'N/A'}. Call them back.`;
          const result = await sendTwilioSms(formatAuPhone(adminPhone), msg);
          return new Response(JSON.stringify({ success: result.success }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: false, error: 'No admin phone configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Check if reminders are enabled
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['reminders_enabled']);
    const settingsMap: Record<string, string> = {};
    (appSettings || []).forEach((s: any) => { settingsMap[s.key] = s.value; });

    if (settingsMap['reminders_enabled'] === 'false') {
      return new Response(JSON.stringify({ success: true, message: 'Reminders disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const results: any[] = [];

    // Get jobs in the next 26 hours (covers both 24h and 2h windows with buffer)
    const futureLimit = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dayAfterStr = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: upcomingJobs } = await supabase
      .from('jobs')
      .select('id, scheduled_date, scheduled_time, property_id, cleaner_1_id, cleaner_2_id, client_reminder_sms_sent_at, cleaner_reminder_sms_sent_at, properties(property_name, address, suburb, client_name)')
      .in('status', ['scheduled', 'confirmed'])
      .in('scheduled_date', [todayStr, tomorrowStr, dayAfterStr])
      .not('cleaner_1_id', 'is', null);

    for (const job of (upcomingJobs || [])) {
      const property = (job as any).properties;
      if (!property) continue;

      const jobDt = getJobDateTimeAEST(job.scheduled_date, job.scheduled_time);
      const hoursUntilJob = (jobDt.getTime() - now.getTime()) / (1000 * 60 * 60);

      // ─── CLIENT REMINDER: 22-26 hours before (24h window) ───
      if (hoursUntilJob >= 22 && hoursUntilJob <= 26 && !(job as any).client_reminder_sms_sent_at) {
        // Find client
        const { data: clientProps } = await supabase
          .from('client_properties')
          .select('client_id')
          .eq('property_id', job.property_id!)
          .limit(1);

        if (clientProps?.length) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', clientProps[0].client_id)
            .single();

          if (profile?.phone) {
            const firstName = (profile.full_name || 'there').split(' ')[0];
            const timeStr = job.scheduled_time ? job.scheduled_time.slice(0, 5) : '';
            const address = [property.address, property.suburb].filter(Boolean).join(', ');

            const message = `Hi ${firstName}, just a reminder your Brightly clean is tomorrow${timeStr ? ` at ${timeStr}` : ''} at ${address || property.property_name}. Reply STOP to opt out.\n\n— Brightly Cleaning`;

            const smsResult = await sendTwilioSms(formatAuPhone(profile.phone), message);
            if (smsResult.success) {
              await supabase.from('jobs').update({ client_reminder_sms_sent_at: now.toISOString() }).eq('id', job.id);
              results.push({ job_id: job.id, type: 'client_reminder', status: 'sent' });
            } else {
              results.push({ job_id: job.id, type: 'client_reminder', status: 'failed', error: smsResult.error });
            }
          }
        }
      }

      // ─── CLEANER REMINDER: 1.5-2.5 hours before ───
      if (hoursUntilJob >= 1.5 && hoursUntilJob <= 2.5 && !(job as any).cleaner_reminder_sms_sent_at) {
        const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean) as string[];

        for (const cleanerId of cleanerIds) {
          const { data: cleanerProfile } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', cleanerId)
            .single();

          if (cleanerProfile?.phone) {
            const firstName = (cleanerProfile.full_name || 'Team member').split(' ')[0];
            const timeStr = job.scheduled_time ? job.scheduled_time.slice(0, 5) : '';
            const address = [property.address, property.suburb].filter(Boolean).join(', ');

            const message = `Hi ${firstName}, reminder: you have a clean today at ${timeStr || 'TBC'} — ${address || property.property_name}. See job details in the app.\n\n— Brightly`;

            const smsResult = await sendTwilioSms(formatAuPhone(cleanerProfile.phone), message);
            if (smsResult.success) {
              results.push({ job_id: job.id, type: 'cleaner_reminder', cleaner: cleanerId, status: 'sent' });
            } else {
              results.push({ job_id: job.id, type: 'cleaner_reminder', cleaner: cleanerId, status: 'failed', error: smsResult.error });
            }
          }
        }

        // Mark cleaner reminder sent for the job
        await supabase.from('jobs').update({ cleaner_reminder_sms_sent_at: now.toISOString() }).eq('id', job.id);
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
