// A cleaner answering an offer from their roster link.
//
// Same three answers the SMS flow already supports, through a different door:
//   accept   — take the job
//   decline  — turn it down before accepting
//   withdraw — hand back one already accepted (BJ: "yes, but I need to know")
//
// withdraw is kept separate from decline on purpose. It happens later, it is
// more expensive, and it is the one BJ wants an alert for.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

type Answer = 'accept' | 'decline' | 'withdraw';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: { token?: string; job_id?: string; answer?: string } = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const token = (body.token ?? '').trim();
  const jobId = (body.job_id ?? '').trim();
  const answer = (body.answer ?? '').trim() as Answer;

  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'Not a valid roster link' }, 401);
  if (!/^[0-9a-f-]{36}$/.test(jobId)) return json({ error: 'Unknown job' }, 400);
  if (!['accept', 'decline', 'withdraw'].includes(answer)) return json({ error: 'Unknown answer' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server not configured' }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tok } = await sb.from('cleaner_roster_tokens')
    .select('cleaner_id, revoked_at').eq('token', token).maybeSingle();
  if (!tok || tok.revoked_at) return json({ error: 'This roster link is no longer active' }, 401);
  const cleanerId = String(tok.cleaner_id);

  // THE AUTHORISATION CHECK. A token identifies a person; it does not entitle
  // them to touch a job. Only someone actually ON this job may answer for it,
  // so a forwarded link cannot be used to decline somebody else's work.
  const { data: job } = await sb.from('jobs')
    .select('id, status, scheduled_date, scheduled_time, cleaner_1_id, cleaner_2_id, properties:property_id(property_name)')
    .eq('id', jobId).maybeSingle();
  if (!job) return json({ error: 'Unknown job' }, 404);

  const isCleaner1 = String(job.cleaner_1_id ?? '') === cleanerId;
  const isCleaner2 = String(job.cleaner_2_id ?? '') === cleanerId;
  if (!isCleaner1 && !isCleaner2) return json({ error: 'That job is not yours' }, 403);

  if (job.status === 'completed' || job.status === 'cancelled') {
    return json({ error: `That clean is already ${job.status}` }, 409);
  }

  const now = new Date().toISOString();
  // PostgREST returns a to-one embed as an object, but the generated types
  // call it an array. Handle both rather than trusting either.
  const propRaw = job.properties as unknown;
  const prop = (Array.isArray(propRaw) ? propRaw[0] : propRaw) as { property_name?: string } | null;
  const propName = prop?.property_name ?? 'a property';

  const { data: existing } = await sb.from('job_acceptances')
    .select('id, acceptance_status').eq('job_id', jobId).eq('cleaner_id', cleanerId).maybeSingle();

  if (answer === 'withdraw' && existing?.acceptance_status !== 'accepted') {
    return json({ error: 'You have not accepted that one' }, 409);
  }
  if (answer !== 'withdraw' && existing?.acceptance_status === 'accepted') {
    // Already accepted: the only way out is withdraw, so the alert fires.
    return json({ error: 'You have already accepted that one' }, 409);
  }

  const newStatus = answer === 'accept' ? 'accepted' : answer === 'decline' ? 'declined' : 'withdrawn';

  if (existing) {
    await sb.from('job_acceptances')
      .update({ acceptance_status: newStatus, responded_at: now }).eq('id', existing.id);
  } else {
    await sb.from('job_acceptances')
      .insert({ job_id: jobId, cleaner_id: cleanerId, acceptance_status: newStatus, responded_at: now });
  }

  // Taking themselves off the job is what actually frees it up for someone
  // else. Without this the schedule still shows them on it and the job never
  // reappears as needing a cleaner.
  if (answer !== 'accept') {
    const patch: Record<string, unknown> = isCleaner1 ? { cleaner_1_id: null } : { cleaner_2_id: null };
    const othersLeft = isCleaner1 ? job.cleaner_2_id : job.cleaner_1_id;
    if (!othersLeft) patch.status = 'pending_cleaner';
    await sb.from('jobs').update(patch).eq('id', jobId);
  } else {
    // Everyone on the job has now said yes: it is really booked.
    const team = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean).map(String);
    const { data: all } = await sb.from('job_acceptances')
      .select('cleaner_id, acceptance_status').eq('job_id', jobId);
    const accepted = new Set((all ?? [])
      .filter((a: Record<string, unknown>) => a.acceptance_status === 'accepted')
      .map((a: Record<string, unknown>) => String(a.cleaner_id)));
    if (team.every((id) => accepted.has(id))) {
      await sb.from('jobs').update({ status: 'confirmed' }).eq('id', jobId);
    }
  }

  const { data: who } = await sb.from('profiles').select('full_name').eq('id', cleanerId).maybeSingle();
  const name = (who?.full_name ?? '').trim() || 'A cleaner';

  // Tell the admins. A decline nobody sees is worse than no decline system:
  // the schedule looks covered right up until the morning it is not.
  if (answer !== 'accept') {
    const { data: admins } = await sb.from('user_roles').select('user_id').eq('role', 'admin');
    const when = `${job.scheduled_date} ${String(job.scheduled_time ?? '').slice(0, 5)}`;
    const verb = answer === 'withdraw' ? 'handed back' : 'declined';
    // Say what is actually left on the job. "Nobody on it now" was being sent
    // on a two-cleaner job where the other person was still on it, which makes
    // every alert less believable and sends BJ chasing cover he already has.
    const { data: after } = await sb.from('jobs')
      .select('cleaner_1_id, cleaner_2_id').eq('id', jobId).maybeSingle();
    const leftIds = [after?.cleaner_1_id, after?.cleaner_2_id].filter(Boolean).map(String);
    let coverage = 'Nobody on it now.';
    if (leftIds.length) {
      const { data: stillOn } = await sb.from('profiles').select('full_name').in('id', leftIds);
      const names = (stillOn ?? [])
        .map((p: { full_name: string | null }) => (p.full_name ?? '').trim().split(' ')[0])
        .filter(Boolean);
      coverage = names.length
        ? `${names.join(' and ')} still on it, needs one more.`
        : 'Still short a cleaner.';
    }
    const headline = `${name} ${verb} ${propName} on ${when}. ${coverage}`;

    const rows = (admins ?? []).map((a: { user_id: string }) => ({
      user_id: a.user_id,
      title: answer === 'withdraw' ? 'Clean handed back' : 'Clean declined',
      message: headline,
      type: 'roster_response',
      event_type: 'roster_response',
      // `notifications_tier_check` allows critical/important/info ONLY. The
      // first cut used urgent/warning, every row was rejected, and because the
      // error was not checked the alerts vanished in silence — the exact
      // failure this block exists to prevent.
      //
      // A hand-back is critical: it was covered, and now it is not.
      tier: answer === 'withdraw' ? 'critical' : 'important',
      read: false,
    }));

    if (rows.length) {
      const { error: notifyErr } = await sb.from('notifications').insert(rows);
      // Never swallow this. A silent failure here is invisible by design.
      if (notifyErr) console.error('[roster-respond] admin notify failed:', notifyErr.message, notifyErr.details);
    }

    // A hand-back also goes out by text. A decline weeks ahead can wait for
    // the next time someone opens the app; a clean dropped the night before
    // cannot, and nobody is sitting in the dashboard at 9pm.
    if (answer === 'withdraw') {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-admin-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ message: `Brightly: ${headline}` }),
        });
        if (!res.ok) console.error('[roster-respond] admin SMS failed:', res.status, await res.text());
      } catch (e) {
        // The answer itself is already saved. A failed text must not undo it.
        console.error('[roster-respond] admin SMS threw:', e);
      }
    }
  }

  return json({ ok: true, answer: newStatus });
});
