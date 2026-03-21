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

Deno.serve(async (req) => {
  // Twilio sends form-encoded POST
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

    // Normalize phone: try matching with and without country code
    const phonesToTry = [from];
    // Also try without leading +61 → 0
    if (from.startsWith('+61')) {
      phonesToTry.push('0' + from.slice(3));
    }
    if (from.startsWith('+1')) {
      phonesToTry.push(from.slice(2));
    }

    // Find profile by phone
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('phone', phonesToTry);

    const profile = profiles?.[0];
    if (!profile) {
      console.log('No profile found for phone:', from);
      return twimlResponse('Sorry, we could not find your account. Please contact your manager. - Brightly');
    }

    const firstName = (profile.full_name || 'Team member').split(' ')[0];

    // Find their most recent pending acceptance
    const { data: acceptances } = await supabase
      .from('job_acceptances')
      .select('*, jobs(scheduled_date, scheduled_time, properties(property_name))')
      .eq('cleaner_id', profile.id)
      .eq('acceptance_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const acceptance = acceptances?.[0];
    if (!acceptance) {
      return twimlResponse(`Hi ${firstName}, you don't have any pending job invitations right now. - Brightly`);
    }

    const job = acceptance.jobs as any;
    const propName = job?.properties?.property_name || 'your job';
    const dateStr = job?.scheduled_date || '';
    const timeStr = job?.scheduled_time?.slice(0, 5) || '';

    if (body === 'YES' || body === 'Y') {
      await supabase
        .from('job_acceptances')
        .update({ acceptance_status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', acceptance.id);

      const reply = `Got it ${firstName}, you're confirmed for ${propName}, ${dateStr} at ${timeStr}. See you there! - Brightly`;
      await sendTwilioSms(from, reply);
      return twimlResponse('');
    } else if (body === 'NO' || body === 'N') {
      await supabase
        .from('job_acceptances')
        .update({ acceptance_status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', acceptance.id);

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
  // Return TwiML XML — empty if we sent via API already
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
