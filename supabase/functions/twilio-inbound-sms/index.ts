import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
  if (digits.startsWith('61') && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function phoneVariants(phone: string): string[] {
  const rawDigits = digitsOnly(phone);
  const normalized = normalizePhone(phone);
  const variants = new Set<string>([phone, rawDigits, normalized]);

  if (normalized.startsWith('0') && normalized.length === 10) {
    variants.add(`61${normalized.slice(1)}`);
    variants.add(`+61${normalized.slice(1)}`);
    variants.add(normalized.slice(1));
  }

  if (rawDigits.startsWith('61') && rawDigits.length === 11) {
    variants.add(`0${rawDigits.slice(2)}`);
    variants.add(rawDigits.slice(2));
  }

  return Array.from(variants).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const body = ((formData.get('Body') as string) || '').trim().toUpperCase();
    const from = ((formData.get('From') as string) || '').trim();

    console.log(`[twilio-inbound-sms] From field received exactly: "${from}"`);
    console.log(`[twilio-inbound-sms] Body: "${body}"`);

    if (!from) return twimlResponse('');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const variants = phoneVariants(from);
    const normalizedIncoming = normalizePhone(from);

    console.log('[twilio-inbound-sms] Phone match pseudo-SQL:');
    console.log(
      `select id, full_name, phone from public.profiles where phone is not null and regexp_replace(phone, '\\D', '', 'g') in (${variants
        .map((v) => `'${digitsOnly(v)}'`)
        .join(', ')});`,
    );

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
      '[twilio-inbound-sms] Profiles found for phone search:',
      matchingProfiles.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        digits: digitsOnly(p.phone || ''),
        normalized: normalizePhone(p.phone || ''),
      })),
    );

    if (matchingProfiles.length === 0) {
      console.log(
        '[twilio-inbound-sms] No profile matched. Available stored phones:',
        (allProfiles || []).map((p) => ({
          full_name: p.full_name,
          phone: p.phone,
          digits: digitsOnly(p.phone || ''),
          normalized: normalizePhone(p.phone || ''),
        })),
      );
      return twimlResponse('Sorry, we could not find your account. Please contact your manager. - Brightly');
    }

    const profile = matchingProfiles[0];
    const firstName = (profile.full_name || 'Team member').split(' ')[0];

    console.log(`[twilio-inbound-sms] Matched profile ${profile.id} (${profile.full_name})`);

    const { data: assignedJobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, status, scheduled_date, scheduled_time, created_at, cleaner_1_id, cleaner_2_id, properties(property_name)')
      .or(`cleaner_1_id.eq.${profile.id},cleaner_2_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (jobsError) {
      console.error('[twilio-inbound-sms] Error fetching assigned jobs:', jobsError);
      return twimlResponse('');
    }

    console.log(
      '[twilio-inbound-sms] All jobs found for matched profile:',
      (assignedJobs || []).map((job) => ({
        id: job.id,
        status: job.status,
        scheduled_date: job.scheduled_date,
        scheduled_time: job.scheduled_time,
        cleaner_1_id: job.cleaner_1_id,
        cleaner_2_id: job.cleaner_2_id,
        property_name: (job.properties as any)?.property_name,
      })),
    );

    const jobIds = (assignedJobs || []).map((job) => job.id);

    const { data: acceptanceRows, error: acceptanceError } = jobIds.length
      ? await supabase
          .from('job_acceptances')
          .select('id, cleaner_id, job_id, acceptance_status, sms_sent_at, responded_at, created_at')
          .eq('cleaner_id', profile.id)
          .in('job_id', jobIds)
      : { data: [], error: null };

    if (acceptanceError) {
      console.error('[twilio-inbound-sms] Error fetching acceptance rows:', acceptanceError);
      return twimlResponse('');
    }

    const acceptanceByJobId = new Map((acceptanceRows || []).map((row) => [row.job_id, row]));

    console.log(
      '[twilio-inbound-sms] Acceptance status for each job found:',
      (assignedJobs || []).map((job) => ({
        job_id: job.id,
        job_status: job.status,
        acceptance_status: acceptanceByJobId.get(job.id)?.acceptance_status ?? null,
        acceptance_id: acceptanceByJobId.get(job.id)?.id ?? null,
      })),
    );

    const candidateJobs = (assignedJobs || []).filter((job) => job.status === 'scheduled' || job.status === 'pending');
    console.log('[twilio-inbound-sms] Candidate scheduled/pending jobs:', candidateJobs.map((job) => job.id));

    const pendingJob = candidateJobs.find((job) => {
      const acceptance = acceptanceByJobId.get(job.id);
      return !acceptance || acceptance.acceptance_status === 'pending';
    });

    const matchedJob = pendingJob || candidateJobs[0] || assignedJobs?.[0];

    if (!matchedJob) {
      console.log('[twilio-inbound-sms] No assigned jobs found for this cleaner.');
      return twimlResponse(`Hi ${firstName}, you don't have any pending job invitations right now. - Brightly`);
    }

    if (!pendingJob) {
      console.log(
        `[twilio-inbound-sms] No pending acceptance row found; falling back to most recent assigned job ${matchedJob.id}.`,
      );
    }

    const existingAcceptance = acceptanceByJobId.get(matchedJob.id);
    const propertyName = (matchedJob.properties as any)?.property_name || 'your job';
    const dateStr = matchedJob.scheduled_date || '';
    const timeStr = matchedJob.scheduled_time?.slice(0, 5) || '';

    if (body === 'YES' || body === 'Y') {
      if (existingAcceptance) {
        const { error } = await supabase
          .from('job_acceptances')
          .update({ acceptance_status: 'accepted', responded_at: new Date().toISOString() })
          .eq('id', existingAcceptance.id);
        if (error) {
          console.error('[twilio-inbound-sms] Failed updating existing acceptance:', error);
          return twimlResponse('');
        }
      } else {
        const { error } = await supabase.from('job_acceptances').insert({
          cleaner_id: profile.id,
          job_id: matchedJob.id,
          acceptance_status: 'accepted',
          responded_at: new Date().toISOString(),
          sms_sent_at: null,
        });
        if (error) {
          console.error('[twilio-inbound-sms] Failed inserting acceptance:', error);
          return twimlResponse('');
        }
      }

      await sendTwilioSms(from, `Got it ${firstName}, you're confirmed for ${propertyName}, ${dateStr} at ${timeStr}. See you there! - Brightly`);
      return twimlResponse('');
    }

    if (body === 'NO' || body === 'N') {
      if (existingAcceptance) {
        const { error } = await supabase
          .from('job_acceptances')
          .update({ acceptance_status: 'declined', responded_at: new Date().toISOString() })
          .eq('id', existingAcceptance.id);
        if (error) {
          console.error('[twilio-inbound-sms] Failed updating existing acceptance:', error);
          return twimlResponse('');
        }
      } else {
        const { error } = await supabase.from('job_acceptances').insert({
          cleaner_id: profile.id,
          job_id: matchedJob.id,
          acceptance_status: 'declined',
          responded_at: new Date().toISOString(),
          sms_sent_at: null,
        });
        if (error) {
          console.error('[twilio-inbound-sms] Failed inserting declined acceptance:', error);
          return twimlResponse('');
        }
      }

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
    headers: { 'Content-Type': 'text/xml', ...corsHeaders },
  });
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
