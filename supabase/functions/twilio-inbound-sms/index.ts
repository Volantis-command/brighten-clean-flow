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
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
  });
}

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, '');
}

function normalizePhone(phone: string): string {
  const digits = digitsOnly(phone);
  if (digits.startsWith('61') && digits.length === 11) {
    return '0' + digits.slice(2);
  }
  return digits;
}

function phoneVariants(phone: string): string[] {
  const rawDigits = digitsOnly(phone);
  const normalized = normalizePhone(phone);
  const variants = new Set<string>([phone, rawDigits, normalized]);

  if (normalized.startsWith('0') && normalized.length === 10) {
    variants.add('61' + normalized.slice(1));
    variants.add('+61' + normalized.slice(1));
    variants.add(normalized.slice(1));
  }

  if (rawDigits.startsWith('61') && rawDigits.length === 11) {
    variants.add('0' + rawDigits.slice(2));
    variants.add(rawDigits.slice(2));
  }

  return Array.from(variants).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const formData = await req.formData();
    const body = ((formData.get('Body') as string) || '').trim().toUpperCase();
    const from = ((formData.get('From') as string) || '').trim();

    console.log(`[twilio-inbound-sms] From field received exactly: "${from}"`);
    console.log(`[twilio-inbound-sms] Body: "${body}"`);

    if (!from) {
      return twimlResponse('');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const variants = phoneVariants(from);
    const normalizedIncoming = normalizePhone(from);

    console.log(`[twilio-inbound-sms] Phone match pseudo-SQL:`);
    console.log(
      `select id, full_name, phone from public.profiles where phone is not null and regexp_replace(phone, '\\D', '', 'g') in (${variants
        .map((v) => `'${digitsOnly(v)}'`)
        .join(', ')});`,
    );
    console.log(`[twilio-inbound-sms] Incoming phone variants: ${JSON.stringify(variants)}`);
    console.log(`[twilio-inbound-sms] Normalized incoming phone: ${normalizedIncoming}`);

    const { data: allProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .not('phone', 'is', null);

    if (profileError) {
      console.error('[twilio-inbound-sms] Error fetching profiles:', profileError);
      return twimlResponse('');
    }

    const matchingProfiles = (allProfiles || []).filter((profile) => {
      const storedDigits = digitsOnly(profile.phone || '');
      const storedNormalized = normalizePhone(profile.phone || '');
      return variants.some((variant) => {
        const variantDigits = digitsOnly(variant);
        return variantDigits === storedDigits || variantDigits === storedNormalized || normalizedIncoming === storedNormalized;
      });
    });

    console.log(
      `[twilio-inbound-sms] Profiles found for phone search: ${JSON.stringify(
        matchingProfiles.map((p) => ({
          id: p.id,
          full_name: p.full_name,
          phone: p.phone,
          digits: digitsOnly(p.phone || ''),
          normalized: normalizePhone(p.phone || ''),
        })),
      )}`,
    );

    if (matchingProfiles.length === 0) {
      console.log(
        `[twilio-inbound-sms] No profile matched. Available stored phones: ${JSON.stringify(
          (allProfiles || []).map((p) => ({
            full_name: p.full_name,
            phone: p.phone,
            digits: digitsOnly(p.phone || ''),
            normalized: normalizePhone(p.phone || ''),
          })),
        )}`,
      );
      return twimlResponse('Sorry, we could not find your account. Please contact your manager. - Brightly');
    }

    const profile = matchingProfiles[0];
    const firstName = (profile.full_name || 'Team member').split(' ')[0];

    console.log(`[twilio-inbound-sms] Matched cleaner profile: ${profile.full_name} (${profile.id}) using stored phone "${profile.phone}"`);

    const { data: allAcceptances, error: acceptancesError } = await supabase
      .from('job_acceptances')
      .select('id, job_id, cleaner_id, acceptance_status, sms_sent_at, responded_at, created_at, jobs(id, status, scheduled_date, scheduled_time, properties(property_name))')
      .eq('cleaner_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (acceptancesError) {
      console.error('[twilio-inbound-sms] Error fetching acceptances:', acceptancesError);
      return twimlResponse('');
    }

    console.log(`[twilio-inbound-sms] All jobs found for profile ${profile.id}: ${JSON.stringify((allAcceptances || []).map((a) => ({
      acceptance_id: a.id,
      job_id: a.job_id,
      acceptance_status: a.acceptance_status,
      sms_sent_at: a.sms_sent_at,
      responded_at: a.responded_at,
      created_at: a.created_at,
      job_status: (a.jobs as any)?.status,
      scheduled_date: (a.jobs as any)?.scheduled_date,
      scheduled_time: (a.jobs as any)?.scheduled_time,
      property_name: (a.jobs as any)?.properties?.property_name,
    }))}`);

    const candidateAcceptances = (allAcceptances || []).filter((a) => {
      const jobStatus = (a.jobs as any)?.status;
      return jobStatus === 'scheduled' || jobStatus === 'pending';
    });

    console.log(`[twilio-inbound-sms] Candidate jobs with status scheduled/pending: ${JSON.stringify(candidateAcceptances.map((a) => ({
      acceptance_id: a.id,
      job_id: a.job_id,
      acceptance_status: a.acceptance_status,
      job_status: (a.jobs as any)?.status,
    }))}`);

    const pendingAcceptance = candidateAcceptances.find((a) => a.acceptance_status === 'pending');
    const acceptance = pendingAcceptance || candidateAcceptances[0] || allAcceptances?.[0];

    if (!acceptance) {
      console.log('[twilio-inbound-sms] No acceptances found for this cleaner at all.');
      return twimlResponse(`Hi ${firstName}, you don't have any pending job invitations right now. - Brightly`);
    }

    if (!pendingAcceptance) {
      console.log(
        `[twilio-inbound-sms] No acceptance_status='pending' rows found. Falling back to most recent candidate acceptance ${acceptance.id} with status ${acceptance.acceptance_status}.`,
      );
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
        console.error('[twilio-inbound-sms] Failed to update acceptance to accepted:', updateErr);
        return twimlResponse('');
      }

      console.log(`[twilio-inbound-sms] Acceptance ${acceptance.id} updated to accepted`);
      await sendTwilioSms(from, `Got it ${firstName}, you're confirmed for ${propName}, ${dateStr} at ${timeStr}. See you there! - Brightly`);
      return twimlResponse('');
    }

    if (body === 'NO' || body === 'N') {
      const { error: updateErr } = await supabase
        .from('job_acceptances')
        .update({ acceptance_status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', acceptance.id);

      if (updateErr) {
        console.error('[twilio-inbound-sms] Failed to update acceptance to declined:', updateErr);
        return twimlResponse('');
      }

      console.log(`[twilio-inbound-sms] Acceptance ${acceptance.id} updated to declined`);
      await sendTwilioSms(from, `No problem ${firstName}, we'll find cover. Thanks for letting us know. - Brightly`);
      return twimlResponse('');
    }

    return twimlResponse('Please reply YES or NO to confirm your job. - Brightly');
  } catch (err) {
    console.error('[twilio-inbound-sms] Unhandled error:', err);
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
