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

async function parseIncoming(req: Request) {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    return {
      from: ((formData.get('From') as string) || '').trim(),
      body: ((formData.get('Body') as string) || '').trim().toUpperCase(),
    };
  }

  const raw = await req.text();
  const params = new URLSearchParams(raw);
  return {
    from: (params.get('From') || '').trim(),
    body: (params.get('Body') || '').trim().toUpperCase(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { from, body } = await parseIncoming(req);

    console.log(`[twilio-inbound-sms v3] From: "${from}"`);
    console.log(`[twilio-inbound-sms v3] Body: "${body}"`);

    if (!from) return twimlResponse('');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const variants = phoneVariants(from);
    const normalizedIncoming = normalizePhone(from);

    console.log('[twilio-inbound-sms v3] Phone match pseudo-SQL:');
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
      console.error('[twilio-inbound-sms v3] Error fetching profiles:', profileError);
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

    console.log('[twilio-inbound-sms v3] Matching profiles:', matchingProfiles.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
    })));

    if (matchingProfiles.length === 0) {
      return twimlResponse('Sorry, we could not find your account. Please contact your manager. - Brightly');
    }

    const matchingProfileIds = matchingProfiles.map((profile) => profile.id);

    const { data: pendingAcceptances, error: pendingError } = await supabase
      .from('job_acceptances')
      .select('id, cleaner_id, job_id, acceptance_status, created_at, jobs(id, status, scheduled_date, scheduled_time, properties(property_name))')
      .in('cleaner_id', matchingProfileIds)
      .eq('acceptance_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);

    if (pendingError) {
      console.error('[twilio-inbound-sms v3] Error fetching pending acceptances:', pendingError);
      return twimlResponse('');
    }

    const pendingScheduledAcceptances = (pendingAcceptances || []).filter((row) => {
      const jobStatus = (row.jobs as any)?.status;
      return jobStatus === 'scheduled' || jobStatus === 'pending';
    });

    console.log('[twilio-inbound-sms v3] Pending acceptance candidates:', pendingScheduledAcceptances.map((row) => ({
      acceptance_id: row.id,
      cleaner_id: row.cleaner_id,
      job_id: row.job_id,
      job_status: (row.jobs as any)?.status,
      property_name: (row.jobs as any)?.properties?.property_name,
    })));

    let selectedProfile = matchingProfiles[0];
    let matchedAcceptance = pendingScheduledAcceptances[0] || null;
    let matchedJob = matchedAcceptance?.jobs as any;

    if (matchedAcceptance) {
      selectedProfile = matchingProfiles.find((profile) => profile.id === matchedAcceptance.cleaner_id) || selectedProfile;
      console.log(`[twilio-inbound-sms v3] Selected via pending acceptance: profile=${selectedProfile.id} acceptance=${matchedAcceptance.id} job=${matchedAcceptance.job_id}`);
    } else {
      const jobOrFilters = matchingProfileIds.flatMap((id) => [`cleaner_1_id.eq.${id}`, `cleaner_2_id.eq.${id}`]).join(',');
      const { data: assignedJobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id, status, scheduled_date, scheduled_time, created_at, cleaner_1_id, cleaner_2_id, properties(property_name)')
        .or(jobOrFilters)
        .order('created_at', { ascending: false })
        .limit(20);

      if (jobsError) {
        console.error('[twilio-inbound-sms v3] Error fetching fallback jobs:', jobsError);
        return twimlResponse('');
      }

      const candidateJob = (assignedJobs || []).find((job) => job.status === 'scheduled' || job.status === 'pending') || assignedJobs?.[0];
      if (candidateJob) {
        matchedJob = candidateJob as any;
        const matchedCleanerId = candidateJob.cleaner_1_id && matchingProfileIds.includes(candidateJob.cleaner_1_id)
          ? candidateJob.cleaner_1_id
          : candidateJob.cleaner_2_id;
        selectedProfile = matchingProfiles.find((profile) => profile.id === matchedCleanerId) || selectedProfile;
        console.log(`[twilio-inbound-sms v3] Selected via fallback job: profile=${selectedProfile.id} job=${candidateJob.id}`);
      }
    }

    if (!matchedJob) {
      const firstName = (selectedProfile.full_name || 'Team member').split(' ')[0];
      console.log('[twilio-inbound-sms v3] No matched job found after pending-first and fallback matching.');
      return twimlResponse(`Hi ${firstName}, you don't have any pending job invitations right now. - Brightly`);
    }

    const firstName = (selectedProfile.full_name || 'Team member').split(' ')[0];
    const propertyName = matchedJob?.properties?.property_name || 'your job';
    const dateStr = matchedJob?.scheduled_date || '';
    const timeStr = matchedJob?.scheduled_time?.slice(0, 5) || '';

    if (body === 'YES' || body === 'Y') {
      if (matchedAcceptance) {
        const { error } = await supabase
          .from('job_acceptances')
          .update({ acceptance_status: 'accepted', responded_at: new Date().toISOString() })
          .eq('id', matchedAcceptance.id);
        if (error) {
          console.error('[twilio-inbound-sms v3] Failed updating acceptance:', error);
          return twimlResponse('');
        }
      } else {
        const { error } = await supabase.from('job_acceptances').insert({
          cleaner_id: selectedProfile.id,
          job_id: matchedJob.id,
          acceptance_status: 'accepted',
          responded_at: new Date().toISOString(),
          sms_sent_at: null,
        });
        if (error) {
          console.error('[twilio-inbound-sms v3] Failed inserting acceptance:', error);
          return twimlResponse('');
        }
      }

      await sendTwilioSms(from, `Got it ${firstName}, you're confirmed for ${propertyName}, ${dateStr} at ${timeStr}. See you there! - Brightly`);
      return twimlResponse('');
    }

    if (body === 'NO' || body === 'N') {
      if (matchedAcceptance) {
        const { error } = await supabase
          .from('job_acceptances')
          .update({ acceptance_status: 'declined', responded_at: new Date().toISOString() })
          .eq('id', matchedAcceptance.id);
        if (error) {
          console.error('[twilio-inbound-sms v3] Failed updating declined acceptance:', error);
          return twimlResponse('');
        }
      } else {
        const { error } = await supabase.from('job_acceptances').insert({
          cleaner_id: selectedProfile.id,
          job_id: matchedJob.id,
          acceptance_status: 'declined',
          responded_at: new Date().toISOString(),
          sms_sent_at: null,
        });
        if (error) {
          console.error('[twilio-inbound-sms v3] Failed inserting declined acceptance:', error);
          return twimlResponse('');
        }
      }

      await sendTwilioSms(from, `No problem ${firstName}, we'll find cover. Thanks for letting us know. - Brightly`);
      return twimlResponse('');
    }

    return twimlResponse('Please reply YES or NO to confirm your job. - Brightly');
  } catch (err) {
    console.error('[twilio-inbound-sms v3] Unhandled error:', err);
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
