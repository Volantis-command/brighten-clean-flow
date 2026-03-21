import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function sendTwilioSms(to: string, body: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  });
}

/** Strip all non-digit chars, then normalize AU numbers to 0-prefix */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Australian +61 → 0
  if (digits.startsWith('61') && digits.length === 11) {
    return '0' + digits.slice(2);
  }
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const formData = await req.formData();
    const body = (formData.get('Body') as string || '').trim().toUpperCase();
    const from = (formData.get('From') as string || '').trim();

    console.log(`Inbound SMS from ${from}: "${body}"`);

    if (!from) {
      return twimlResponse('');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const normalizedIncoming = normalizePhone(from);
    console.log(`Normalized incoming phone: ${normalizedIncoming}`);

    // Fetch ALL profiles with a phone number and match flexibly
    const { data: allProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .not('phone', 'is', null);

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return twimlResponse('');
    }

    console.log(`Found ${allProfiles?.length || 0} profiles with phone numbers`);

    const profile = allProfiles?.find((p) => {
      if (!p.phone) return false;
      const normalizedStored = normalizePhone(p.phone);
      return normalizedStored === normalizedIncoming;
    });

    if (!profile) {
      console.log(`No profile matched for normalized phone: ${normalizedIncoming}`);
      console.log('Stored phones:', allProfiles?.map(p => `${p.full_name}: ${p.phone} → ${normalizePhone(p.phone!)}`));
      return twimlResponse('Sorry, we could not find your account. Please contact your manager. - Brightly');
    }

    console.log(`Matched profile: ${profile.full_name} (${profile.id})`);
    const firstName = (profile.full_name || 'Team member').split(' ')[0];

    // Find their most recent pending acceptance — no job status filter, no time filter
    const { data: acceptances, error: accError } = await supabase
      .from('job_acceptances')
      .select('*, jobs(id, status, scheduled_date, scheduled_time, properties(property_name))')
      .eq('cleaner_id', profile.id)
      .eq('acceptance_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    if (accError) {
      console.error('Error fetching acceptances:', accError);
      return twimlResponse('');
    }

    console.log(`Found ${acceptances?.length || 0} pending acceptances for cleaner ${profile.id}`);
    acceptances?.forEach((a, i) => {
      const j = a.jobs as any;
      console.log(`  [${i}] acceptance ${a.id} | job ${j?.id} status=${j?.status} | date=${j?.scheduled_date} | property=${j?.properties?.property_name}`);
    });

    // Pick the most recent pending one (already ordered by created_at desc)
    const acceptance = acceptances?.[0];
    if (!acceptance) {
      // Also check if they have ANY acceptances at all for debugging
      const { data: allAcc } = await supabase
        .from('job_acceptances')
        .select('id, acceptance_status, created_at')
        .eq('cleaner_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5);
      console.log(`No pending acceptances. All recent acceptances:`, allAcc);
      return twimlResponse(`Hi ${firstName}, you don't have any pending job invitations right now. - Brightly`);
    }

    const job = acceptance.jobs as any;
    const propName = job?.properties?.property_name || 'your job';
    const dateStr = job?.scheduled_date || '';
    const timeStr = job?.scheduled_time?.slice(0, 5) || '';

    if (body === 'YES' || body === 'Y') {
      const { error: updateErr } = await supabase
        .from('job_acceptances')
        .update({ acceptance_status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', acceptance.id);

      if (updateErr) {
        console.error('Failed to update acceptance:', updateErr);
        return twimlResponse('');
      }

      console.log(`Acceptance ${acceptance.id} updated to ACCEPTED`);
      const reply = `Got it ${firstName}, you're confirmed for ${propName}, ${dateStr} at ${timeStr}. See you there! - Brightly`;
      await sendTwilioSms(from, reply);
      return twimlResponse('');
    } else if (body === 'NO' || body === 'N') {
      const { error: updateErr } = await supabase
        .from('job_acceptances')
        .update({ acceptance_status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', acceptance.id);

      if (updateErr) {
        console.error('Failed to update acceptance:', updateErr);
        return twimlResponse('');
      }

      console.log(`Acceptance ${acceptance.id} updated to DECLINED`);
      const reply = `No problem ${firstName}, we'll find cover. Thanks for letting us know. - Brightly`;
      await sendTwilioSms(from, reply);
      return twimlResponse('');
    } else {
      return twimlResponse('Please reply YES or NO to confirm your job. - Brightly');
    }
  } catch (err) {
    console.error('twilio-inbound-sms error:', err);
    return twimlResponse('');
  }
});

function twimlResponse(message: string): Response {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
