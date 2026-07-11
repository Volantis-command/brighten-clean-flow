// Server-side scheduled-SMS dispatcher. Runs on a pg_cron schedule so reminder
// texts fire whether or not anyone has the dashboard open (the old browser hook
// only sent when an admin was looking at the dashboard — and two open tabs
// double-sent). Each row is claimed atomically (pending -> sending) so this
// worker and any lingering browser dispatch can never send the same SMS twice.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatAuPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+61')) return cleaned;
  if (cleaned.startsWith('61') && cleaned.length >= 11) return '+' + cleaned;
  if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1);
  return '+61' + cleaned;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  const results = { claimed: 0, sent: 0, failed: 0, cancelled: 0, skipped: 0 };

  // Candidate due rows
  const { data: candidates, error } = await sb
    .from('scheduled_sms')
    .select('id')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  for (const c of candidates ?? []) {
    // Atomic claim — only one caller can flip this row pending -> sending.
    const { data: claimed } = await sb
      .from('scheduled_sms')
      .update({ status: 'sending' })
      .eq('id', c.id)
      .eq('status', 'pending')
      .select('id, recipient_phone, message, job_id');
    const row = claimed?.[0];
    if (!row) { results.skipped++; continue; }
    results.claimed++;

    if (!row.recipient_phone || !row.message) {
      await sb.from('scheduled_sms').update({ status: 'failed', error: 'Missing phone or message' }).eq('id', row.id);
      results.failed++;
      continue;
    }

    // Don't send reminders for cancelled jobs.
    if (row.job_id) {
      const { data: job } = await sb.from('jobs').select('status').eq('id', row.job_id).maybeSingle();
      if (job?.status === 'cancelled') {
        await sb.from('scheduled_sms').update({ status: 'cancelled', error: 'Job was cancelled' }).eq('id', row.id);
        results.cancelled++;
        continue;
      }
    }

    if (!accountSid || !authToken || !fromNumber) {
      // No Twilio config — release the claim so a later run can retry.
      await sb.from('scheduled_sms').update({ status: 'pending' }).eq('id', row.id);
      results.skipped++;
      continue;
    }

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: formatAuPhone(row.recipient_phone),
            From: fromNumber,
            Body: row.message,
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.text();
        await sb.from('scheduled_sms').update({ status: 'failed', error: `Twilio ${res.status}: ${detail.slice(0, 300)}` }).eq('id', row.id);
        results.failed++;
        continue;
      }
      await sb.from('scheduled_sms').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id);
      results.sent++;
    } catch (err) {
      await sb.from('scheduled_sms').update({ status: 'failed', error: (err as Error).message || 'Send failed' }).eq('id', row.id);
      results.failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
