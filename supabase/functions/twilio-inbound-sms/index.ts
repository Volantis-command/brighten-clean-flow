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

const DECLINE_KEYWORDS = ['NO', 'N', 'NO THANKS', 'NOT INTERESTED', 'CANCEL', 'NOPE'];

function isDeclineMessage(body: string): boolean {
  return DECLINE_KEYWORDS.includes(body.trim());
}

async function handleQuoteReply(supabase: any, from: string, body: string, variants: string[], normalizedIncoming: string): Promise<Response | null> {
  const { data: allQuotes } = await supabase
    .from('quotes')
    .select('id, client_name, client_phone, property_address, property_name, clean_type, status, property_id')
    .eq('status', 'quote_sent');

  if (!allQuotes?.length) return null;

  const matchedQuote = allQuotes.find((q: any) => q.client_phone && phoneMatchesAny(q.client_phone, variants, normalizedIncoming));
  if (!matchedQuote) return null;

  const firstName = (matchedQuote.client_name || 'there').split(' ')[0];

  if (body === 'YES' || body === 'Y') {
    await supabase.from('quotes').update({ 
      status: 'client_accepted', 
      quote_accepted_at: new Date().toISOString() 
    }).eq('id', matchedQuote.id);

    // Determine if this clean type supports self-service booking
    const cleanType = (matchedQuote.clean_type || '').toLowerCase();
    const isManualFollowUp = cleanType.includes('airbnb') || cleanType.includes('short-stay') || cleanType.includes('short stay') || cleanType.includes('turnover') || cleanType.includes('commercial');

    if (isManualFollowUp) {
      // No booking link for Airbnb or Commercial — admin follows up manually
      await sendTwilioSms(from, `Thanks ${firstName}! 🎉 We've received your acceptance. One of our team will be in touch shortly to confirm your first booking.\n\nQuestions? 0418 878 707\n— Brightly Cleaning 🌿`);
    } else {
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

      await sendTwilioSms(from, `Great! 🎉 To confirm your booking, please select your preferred date and time here: ${bookingLink}`);
    }

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

  if (isDeclineMessage(body)) {
    await supabase.from('quotes').update({
      status: 'quote_declined',
      quote_declined_at: new Date().toISOString()
    }).eq('id', matchedQuote.id);

    // Also update matching quote_requests to 'declined'
    const { data: allQr } = await supabase
      .from('quote_requests')
      .select('id, phone, status')
      .in('status', ['quote_sent', 'awaiting_client_response']);
    if (allQr?.length) {
      const matchedQr = allQr.find((qr: any) => qr.phone && phoneMatchesAny(qr.phone, variants, normalizedIncoming));
      if (matchedQr) {
        await supabase.from('quote_requests').update({ status: 'declined' }).eq('id', matchedQr.id);
      }
    }

    await sendTwilioSms(from, `No worries! If you change your mind, we're here. — Brightly 🌿`);

    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.user_id,
        type: 'quote',
        title: 'Client Declined Quote',
        message: `Client declined quote — ${matchedQuote.client_name || 'Client'} — ${matchedQuote.property_address || matchedQuote.property_name || 'property'}`,
        link: '/quoting',
      });
    }

    console.log(`[twilio-inbound-sms] Quote ${matchedQuote.id} declined by ${from}`);
    return twimlResponse('');
  }

  return null;
}

// ─── Handle feedback rating reply (1-5) ───
async function handleFeedbackRating(supabase: any, from: string, body: string, matchingProfileIds: string[], variants: string[], normalizedIncoming: string): Promise<Response | null> {
  const rating = parseInt(body, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) return null;

  // Find the most recent completed job for this client where we sent a rating SMS
  // Match by phone via client_properties → profiles
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .not('phone', 'is', null);

  const matchedClientProfiles = (allProfiles || []).filter((p: any) =>
    p.phone && phoneMatchesAny(p.phone, variants, normalizedIncoming)
  );

  if (!matchedClientProfiles.length) return null;

  const clientIds = matchedClientProfiles.map((p: any) => p.id);

  // Check if any of these clients have a recent job with feedback_rating_sms_sent_at
  const { data: clientProps } = await supabase
    .from('client_properties')
    .select('client_id, property_id')
    .in('client_id', clientIds);

  if (!clientProps?.length) return null;

  const propertyIds = clientProps.map((cp: any) => cp.property_id);

  const { data: recentJobs } = await supabase
    .from('jobs')
    .select('id, property_id')
    .in('property_id', propertyIds)
    .eq('status', 'completed')
    .not('feedback_rating_sms_sent_at', 'is', null)
    .order('feedback_rating_sms_sent_at', { ascending: false })
    .limit(1);

  if (!recentJobs?.length) return null;

  const job = recentJobs[0];
  const matchedCp = clientProps.find((cp: any) => cp.property_id === job.property_id);
  if (!matchedCp) return null;

  const clientId = matchedCp.client_id;
  const firstName = (matchedClientProfiles.find((p: any) => p.id === clientId)?.full_name || 'there').split(' ')[0];

  // Store feedback
  await supabase.from('job_feedback').upsert({
    job_id: job.id,
    client_id: clientId,
    score: rating,
    comments: `SMS rating: ${rating}`,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'job_id,client_id', ignoreDuplicates: false });

  // Update job feedback_score
  await supabase.from('jobs').update({ feedback_score: rating }).eq('id', job.id);

  if (rating >= 4) {
    // Get Google review URL
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('key', 'google_review_url')
      .single();

    const googleUrl = appSettings?.value || '';

    if (googleUrl) {
      await sendTwilioSms(from, `Thank you ${firstName}! 🌟 We're so glad you're happy. If you have a moment, a Google review would mean the world to us: ${googleUrl}\n\n— Brightly Cleaning`);
    } else {
      await sendTwilioSms(from, `Thank you ${firstName}! 🌟 We're so glad you're happy with your clean.\n\n— Brightly Cleaning`);
    }
  } else {
    await sendTwilioSms(from, `Thanks for the feedback. Our manager will be in touch shortly.\n\n— Brightly Cleaning`);

    // Create admin alert
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    for (const admin of (admins || [])) {
      await supabase.from('notifications').insert({
        user_id: admin.user_id,
        type: 'alert',
        title: '⚠️ Low Feedback Score',
        message: `${firstName} rated their clean ${rating}/5. Follow up needed.`,
        link: `/jobs/${job.id}`,
      });
    }
  }

  console.log(`[twilio-inbound-sms] Feedback rating ${rating} from ${from} for job ${job.id}`);
  return twimlResponse('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { from, body } = await parseIncoming(req);

    console.log(`[twilio-inbound-sms v5] From: "${from}"`);
    console.log(`[twilio-inbound-sms v5] Body: "${body}"`);

    if (!from) return twimlResponse('');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const variants = phoneVariants(from);
    const normalizedIncoming = normalizePhone(from);

    // ─── 1. Check if sender is a STAFF member with pending jobs ───
    const { data: allProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .not('phone', 'is', null);

    if (profileError) {
      console.error('[twilio-inbound-sms] Error fetching profiles:', profileError);
      return twimlResponse('');
    }

    const matchingProfiles = (allProfiles || []).filter((profile: any) =>
      phoneMatchesAny(profile.phone, variants, normalizedIncoming)
    );

    const matchingProfileIds = matchingProfiles.map((p: any) => p.id);
    let isStaffMember = false;

    if (matchingProfileIds.length > 0) {
      const { data: staffRoles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', matchingProfileIds)
        .in('role', ['cleaner', 'head_cleaner']);

      isStaffMember = (staffRoles || []).length > 0;
    }

    // ─── 1.5 Check for feedback rating reply (1-5) ───
    const ratingNum = parseInt(body, 10);
    if (!isNaN(ratingNum) && ratingNum >= 1 && ratingNum <= 5) {
      const feedbackResult = await handleFeedbackRating(supabase, from, body, matchingProfileIds, variants, normalizedIncoming);
      if (feedbackResult) return feedbackResult;
    }

    // ─── 2. STAFF flow: handle cleaner job acceptance ───
    if (isStaffMember && (body === 'YES' || body === 'Y' || body === 'NO' || body === 'N')) {
      const { data: pendingAcceptances } = await supabase
        .from('job_acceptances')
        .select('id, cleaner_id, job_id, acceptance_status, created_at, jobs(id, status, scheduled_date, scheduled_time, properties(property_name))')
        .in('cleaner_id', matchingProfileIds)
        .eq('acceptance_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);

      // The job state machine values that mean "this job is awaiting a cleaner
      // response": awaiting_cleaner_acceptance is the current canonical state
      // (see src/lib/jobAssignment.ts and 08-Database-Schema/reference.md).
      // 'scheduled' and 'pending' are LEGACY values kept for backwards compat
      // with old rows. Pre-fix this filter only matched the legacy values, so
      // every modern cleaner reply was rejected with "couldn't match it to a
      // pending action." Brendan flagged 2026-04-26 (BJ replied YES, got
      // generic "Please reply YES or NO" back).
      const PENDING_JOB_STATUSES = [
        'awaiting_cleaner_acceptance',
        'scheduled',
        'pending',
      ];

      const pendingScheduledAcceptances = (pendingAcceptances || []).filter((row: any) => {
        const jobStatus = (row.jobs as any)?.status;
        return PENDING_JOB_STATUSES.includes(jobStatus);
      });

      let selectedProfile = matchingProfiles[0];
      let matchedAcceptance = pendingScheduledAcceptances[0] || null;
      let matchedJob = matchedAcceptance?.jobs as any;

      if (matchedAcceptance) {
        selectedProfile = matchingProfiles.find((p: any) => p.id === matchedAcceptance.cleaner_id) || selectedProfile;
      } else {
        const jobOrFilters = matchingProfileIds.flatMap((id: string) => [`cleaner_1_id.eq.${id}`, `cleaner_2_id.eq.${id}`]).join(',');
        const { data: assignedJobs } = await supabase
          .from('jobs')
          .select('id, status, scheduled_date, scheduled_time, created_at, cleaner_1_id, cleaner_2_id, properties(property_name)')
          .or(jobOrFilters)
          .in('status', PENDING_JOB_STATUSES)
          .order('created_at', { ascending: false })
          .limit(20);

        const candidateJob = (assignedJobs || [])[0];
        if (candidateJob) {
          matchedJob = candidateJob as any;
          const matchedCleanerId = candidateJob.cleaner_1_id && matchingProfileIds.includes(candidateJob.cleaner_1_id)
            ? candidateJob.cleaner_1_id
            : candidateJob.cleaner_2_id;
          selectedProfile = matchingProfiles.find((p: any) => p.id === matchedCleanerId) || selectedProfile;
        }
      }

      if (matchedJob) {
        const firstName = (selectedProfile.full_name || 'Team member').split(' ')[0];
        const propertyName = matchedJob?.properties?.property_name || 'your job';
        const dateStr = matchedJob?.scheduled_date || '';
        const timeStr = matchedJob?.scheduled_time?.slice(0, 5) || '';

        if (body === 'YES' || body === 'Y') {
          // 1. Record the acceptance
          if (matchedAcceptance) {
            await supabase.from('job_acceptances').update({ acceptance_status: 'accepted', responded_at: new Date().toISOString() }).eq('id', matchedAcceptance.id);
          } else {
            await supabase.from('job_acceptances').insert({
              cleaner_id: selectedProfile.id, job_id: matchedJob.id, acceptance_status: 'accepted',
              responded_at: new Date().toISOString(), sms_sent_at: null,
            });
          }

          // 2. If every assigned cleaner has now accepted, transition the
          //    job from awaiting_cleaner_acceptance → confirmed. Mirrors the
          //    in-app acceptJob() in src/lib/jobAssignment.ts so SMS accept
          //    and in-app accept land in the same state.
          const { data: jobRow } = await supabase
            .from('jobs')
            .select('cleaner_1_id, cleaner_2_id, status')
            .eq('id', matchedJob.id)
            .maybeSingle();
          if (jobRow) {
            const assignedIds = [jobRow.cleaner_1_id, jobRow.cleaner_2_id].filter(Boolean) as string[];
            const { data: allAcceptances } = await supabase
              .from('job_acceptances')
              .select('cleaner_id, acceptance_status')
              .eq('job_id', matchedJob.id)
              .in('cleaner_id', assignedIds.length ? assignedIds : ['__none__']);
            const allAccepted =
              assignedIds.length > 0 &&
              assignedIds.every((cid) =>
                (allAcceptances || []).find((a: any) => a.cleaner_id === cid)?.acceptance_status === 'accepted'
              );
            if (allAccepted && jobRow.status === 'awaiting_cleaner_acceptance') {
              await supabase.from('jobs').update({ status: 'confirmed' } as any).eq('id', matchedJob.id);
            }
          }

          await sendTwilioSms(from, `Got it ${firstName}, you're confirmed for ${propertyName}, ${dateStr} at ${timeStr}. See you there! - Brightly`);
          return twimlResponse('');
        }

        if (body === 'NO' || body === 'N') {
          // 1. Record the decline
          if (matchedAcceptance) {
            await supabase.from('job_acceptances').update({ acceptance_status: 'declined', responded_at: new Date().toISOString() }).eq('id', matchedAcceptance.id);
          } else {
            await supabase.from('job_acceptances').insert({
              cleaner_id: selectedProfile.id, job_id: matchedJob.id, acceptance_status: 'declined',
              responded_at: new Date().toISOString(), sms_sent_at: null,
            });
          }

          // 2. Remove the cleaner from the job's slot(s) and revert status
          //    to pending_cleaner if no cleaners are left. Mirrors
          //    declineJob() in src/lib/jobAssignment.ts so admin can
          //    reassign.
          const { data: jobRow } = await supabase
            .from('jobs')
            .select('cleaner_1_id, cleaner_2_id')
            .eq('id', matchedJob.id)
            .maybeSingle();
          if (jobRow) {
            const update: Record<string, any> = {};
            if (jobRow.cleaner_1_id === selectedProfile.id) update.cleaner_1_id = null;
            if (jobRow.cleaner_2_id === selectedProfile.id) update.cleaner_2_id = null;
            const remaining = [
              update.cleaner_1_id === undefined ? jobRow.cleaner_1_id : update.cleaner_1_id,
              update.cleaner_2_id === undefined ? jobRow.cleaner_2_id : update.cleaner_2_id,
            ].filter(Boolean);
            if (remaining.length === 0) update.status = 'pending_cleaner';
            if (Object.keys(update).length > 0) {
              await supabase.from('jobs').update(update as any).eq('id', matchedJob.id);
            }
          }

          // 3. Delete the acceptance row so admin can cleanly reassign
          await supabase
            .from('job_acceptances')
            .delete()
            .eq('job_id', matchedJob.id)
            .eq('cleaner_id', selectedProfile.id);

          await sendTwilioSms(from, `No problem ${firstName}, we'll find cover. Thanks for letting us know. - Brightly`);
          return twimlResponse('');
        }
      }
    }

    // ─── 3. CLIENT flow: check for quote replies ───
    if (body === 'YES' || body === 'Y' || isDeclineMessage(body)) {
      const quoteResult = await handleQuoteReply(supabase, from, body, variants, normalizedIncoming);
      if (quoteResult) return quoteResult;
    }

    // ─── 4. No match — generic response ───
    if (matchingProfiles.length > 0) {
      const firstName = (matchingProfiles[0].full_name || 'there').split(' ')[0];
      return twimlResponse(`Hi ${firstName}, we received your message but couldn't match it to a pending action. Please reply YES or NO. - Brightly`);
    }

    return twimlResponse('Sorry, we could not find your account. Please contact your manager. - Brightly');
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
