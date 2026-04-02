import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APP_URL = 'https://app.brightly.cleaning';

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

function phoneMatchesAny(storedPhone: string, variants: string[], normalizedIncoming: string): boolean {
  const storedDigits = digitsOnly(storedPhone || '');
  const storedNormalized = normalizePhone(storedPhone || '');
  return variants.some((variant) => {
    const variantDigits = digitsOnly(variant);
    return variantDigits === storedDigits || variantDigits === storedNormalized || normalizedIncoming === storedNormalized;
  });
}

async function handleQuoteReply(supabase: any, from: string, body: string, variants: string[], normalizedIncoming: string): Promise<Response | null> {
  // Find quotes with status 'quote_sent' where client_phone matches
  const { data: allQuotes } = await supabase
    .from('quotes')
    .select('id, client_name, client_phone, property_address, property_name, clean_type, status, property_id')
    .eq('status', 'quote_sent');

  if (!allQuotes?.length) return null;

  const matchedQuote = allQuotes.find((q: any) => q.client_phone && phoneMatchesAny(q.client_phone, variants, normalizedIncoming));
  if (!matchedQuote) return null;

  const firstName = (matchedQuote.client_name || 'there').split(' ')[0];

  if (body === 'YES' || body === 'Y') {
    // Update quote status
    await supabase.from('quotes').update({ 
      status: 'client_accepted', 
      quote_accepted_at: new Date().toISOString() 
    }).eq('id', matchedQuote.id);

    // Look up the quote_requests record for this phone to build booking URL
    let bookingLink = APP_URL;
    const { data: allQr } = await supabase
      .from('quote_requests')
      .select('id, phone, status')
      .eq('status', 'quote_sent');

    if (allQr?.length) {
      const matchedQr = allQr.find((qr: any) => qr.phone && phoneMatchesAny(qr.phone, variants, normalizedIncoming));
      if (matchedQr) {
        bookingLink = `${APP_URL}/book?lead=${matchedQr.id}`;
      }
    }

    // Send follow-up SMS
    await sendTwilioSms(from, `Great! 🎉 To confirm your booking, please select your preferred date and time here: ${bookingLink}`);

    // Create admin notification
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.user_id,
        type: 'quote',
        title: 'Client Accepted Quote',
        message: `Client accepted quote · ${matchedQuote.client_name || 'Client'} — awaiting date selection`,
        link: '/actions?filter=awaiting_schedule',
      });
    }

    console.log(`[twilio-inbound-sms] Quote ${matchedQuote.id} accepted by ${from}`);
    return twimlResponse('');
  }

  if (body === 'NO' || body === 'N') {
    // Update quote status
    await supabase.from('quotes').update({ 
      status: 'quote_declined', 
      quote_declined_at: new Date().toISOString() 
    }).eq('id', matchedQuote.id);

    // Send decline SMS
    await sendTwilioSms(from, `No worries ${firstName}! If you change your mind, we're here. — Brightly Cleaning 🌿`);

    // Notify admin
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.user_id,
        type: 'quote',
        title: 'Quote Declined',
        message: `${matchedQuote.client_name || 'Client'} declined their quote for ${matchedQuote.property_address || matchedQuote.property_name || 'property'}.`,
        link: '/quoting',
      });
    }

    console.log(`[twilio-inbound-sms] Quote ${matchedQuote.id} declined by ${from}`);
    return twimlResponse('');
  }

  // Not YES/NO but matched a quote — prompt
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { from, body } = await parseIncoming(req);

    console.log(`[twilio-inbound-sms v4] From: "${from}"`);
    console.log(`[twilio-inbound-sms v4] Body: "${body}"`);

    if (!from) return twimlResponse('');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const variants = phoneVariants(from);
    const normalizedIncoming = normalizePhone(from);

    // ─── Try quote reply first (YES/NO to quotes) ───
    if (body === 'YES' || body === 'Y' || body === 'NO' || body === 'N') {
      const quoteResult = await handleQuoteReply(supabase, from, body, variants, normalizedIncoming);
      if (quoteResult) return quoteResult;
    }

    // ─── Existing job acceptance logic ───
    const { data: allProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .not('phone', 'is', null);

    if (profileError) {
      console.error('[twilio-inbound-sms v4] Error fetching profiles:', profileError);
      return twimlResponse('');
    }

    const matchingProfiles = (allProfiles || []).filter((profile: any) => 
      phoneMatchesAny(profile.phone, variants, normalizedIncoming)
    );

    console.log('[twilio-inbound-sms v4] Matching profiles:', matchingProfiles.map((p: any) => ({
      id: p.id, full_name: p.full_name, phone: p.phone,
    })));

    if (matchingProfiles.length === 0) {
      return twimlResponse('Sorry, we could not find your account. Please contact your manager. - Brightly');
    }

    const matchingProfileIds = matchingProfiles.map((profile: any) => profile.id);

    const { data: pendingAcceptances, error: pendingError } = await supabase
      .from('job_acceptances')
      .select('id, cleaner_id, job_id, acceptance_status, created_at, jobs(id, status, scheduled_date, scheduled_time, properties(property_name))')
      .in('cleaner_id', matchingProfileIds)
      .eq('acceptance_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);

    if (pendingError) {
      console.error('[twilio-inbound-sms v4] Error fetching pending acceptances:', pendingError);
      return twimlResponse('');
    }

    const pendingScheduledAcceptances = (pendingAcceptances || []).filter((row: any) => {
      const jobStatus = (row.jobs as any)?.status;
      return jobStatus === 'scheduled' || jobStatus === 'pending';
    });

    let selectedProfile = matchingProfiles[0];
    let matchedAcceptance = pendingScheduledAcceptances[0] || null;
    let matchedJob = matchedAcceptance?.jobs as any;

    if (matchedAcceptance) {
      selectedProfile = matchingProfiles.find((profile: any) => profile.id === matchedAcceptance.cleaner_id) || selectedProfile;
    } else {
      const jobOrFilters = matchingProfileIds.flatMap((id: string) => [`cleaner_1_id.eq.${id}`, `cleaner_2_id.eq.${id}`]).join(',');
      const { data: assignedJobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id, status, scheduled_date, scheduled_time, created_at, cleaner_1_id, cleaner_2_id, properties(property_name)')
        .or(jobOrFilters)
        .order('created_at', { ascending: false })
        .limit(20);

      if (jobsError) {
        console.error('[twilio-inbound-sms v4] Error fetching fallback jobs:', jobsError);
        return twimlResponse('');
      }

      const candidateJob = (assignedJobs || []).find((job: any) => job.status === 'scheduled' || job.status === 'pending') || assignedJobs?.[0];
      if (candidateJob) {
        matchedJob = candidateJob as any;
        const matchedCleanerId = candidateJob.cleaner_1_id && matchingProfileIds.includes(candidateJob.cleaner_1_id)
          ? candidateJob.cleaner_1_id
          : candidateJob.cleaner_2_id;
        selectedProfile = matchingProfiles.find((profile: any) => profile.id === matchedCleanerId) || selectedProfile;
      }
    }

    if (!matchedJob) {
      const firstName = (selectedProfile.full_name || 'Team member').split(' ')[0];
      return twimlResponse(`Hi ${firstName}, you don't have any pending job invitations right now. - Brightly`);
    }

    const firstName = (selectedProfile.full_name || 'Team member').split(' ')[0];
    const propertyName = matchedJob?.properties?.property_name || 'your job';
    const dateStr = matchedJob?.scheduled_date || '';
    const timeStr = matchedJob?.scheduled_time?.slice(0, 5) || '';

    if (body === 'YES' || body === 'Y') {
      if (matchedAcceptance) {
        await supabase.from('job_acceptances').update({ acceptance_status: 'accepted', responded_at: new Date().toISOString() }).eq('id', matchedAcceptance.id);
      } else {
        await supabase.from('job_acceptances').insert({
          cleaner_id: selectedProfile.id, job_id: matchedJob.id, acceptance_status: 'accepted',
          responded_at: new Date().toISOString(), sms_sent_at: null,
        });
      }
      await sendTwilioSms(from, `Got it ${firstName}, you're confirmed for ${propertyName}, ${dateStr} at ${timeStr}. See you there! - Brightly`);
      return twimlResponse('');
    }

    if (body === 'NO' || body === 'N') {
      if (matchedAcceptance) {
        await supabase.from('job_acceptances').update({ acceptance_status: 'declined', responded_at: new Date().toISOString() }).eq('id', matchedAcceptance.id);
      } else {
        await supabase.from('job_acceptances').insert({
          cleaner_id: selectedProfile.id, job_id: matchedJob.id, acceptance_status: 'declined',
          responded_at: new Date().toISOString(), sms_sent_at: null,
        });
      }
      await sendTwilioSms(from, `No problem ${firstName}, we'll find cover. Thanks for letting us know. - Brightly`);
      return twimlResponse('');
    }

    return twimlResponse('Please reply YES or NO to confirm your job. - Brightly');
  } catch (err) {
    console.error('[twilio-inbound-sms v4] Unhandled error:', err);
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
