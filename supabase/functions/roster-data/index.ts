// Serves one person's roster from their standing token.
//
// PUBLIC BY TOKEN, NOT BY LOGIN. Cleaners open this from a text on a phone,
// often with one hand and no patience. A login would mean an OTP round trip
// every time they want to check Thursday, so the token in the link is the
// credential and it never expires on its own.
//
// What that buys has to be paid for in care:
//   - the token is 64 hex chars, generated in the database, never derived
//     from anything guessable like a phone number or a job id;
//   - a revoked token stops working immediately (revoked_at is checked here,
//     not just at issue);
//   - the response carries ONLY what that person needs. A cleaner gets their
//     own cleans. Admin and head cleaner get the whole team, because BJ asked
//     for exactly those two roles to see everyone and nobody else to.
//
// Deliberately NOT returned to a cleaner: prices, client contact details, or
// anyone else's jobs. A link forwarded to the wrong person should leak as
// little as possible.
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

const TZ = 'Australia/Brisbane';

/** Local date N days from today, in the properties' timezone. */
function localDate(offsetDays = 0, now = new Date()): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(shifted);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

/** Monday of the week containing `date`. Weeks start Monday on this roster. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: { token?: string; week_of?: string; month_of?: string } = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const token = (body.token ?? '').trim();
  // Shape-check before touching the database: a short or odd token is never
  // valid, and refusing it here keeps junk out of the query path.
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'Not a valid roster link' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server not configured' }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tok } = await sb
    .from('cleaner_roster_tokens')
    .select('id, cleaner_id, revoked_at')
    .eq('token', token)
    .maybeSingle();
  // Same message either way: a wrong token and a revoked one must not be
  // distinguishable, or the response becomes an oracle for guessing.
  if (!tok || tok.revoked_at) return json({ error: 'This roster link is no longer active' }, 401);

  const cleanerId = String(tok.cleaner_id);

  const { data: me } = await sb.from('profiles').select('id, full_name').eq('id', cleanerId).maybeSingle();
  const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', cleanerId);
  const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
  const seesEveryone = roleSet.has('admin') || roleSet.has('head_cleaner');

  // Week window, or a whole month when the calendar view asks for one.
  let from: string;
  let to: string;
  if (body.month_of && /^\d{4}-\d{2}$/.test(body.month_of)) {
    from = `${body.month_of}-01`;
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    to = addDays(d.toISOString().slice(0, 10), -1);
  } else {
    const anchor = body.week_of && /^\d{4}-\d{2}-\d{2}$/.test(body.week_of) ? body.week_of : localDate(0);
    from = mondayOf(anchor);
    to = addDays(from, 6);
  }

  let q = sb.from('jobs')
    .select('id, scheduled_date, scheduled_time, status, estimated_duration, cleaner_1_id, cleaner_2_id, notes, is_back_to_back, is_owner_stay, properties:property_id(property_name, address, suburb)')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .neq('status', 'cancelled')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true });

  // A cleaner only ever sees their own work.
  if (!seesEveryone) q = q.or(`cleaner_1_id.eq.${cleanerId},cleaner_2_id.eq.${cleanerId}`);

  const { data: jobs, error: jobsErr } = await q;
  if (jobsErr) return json({ error: 'Could not load the roster' }, 500);

  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
  const { data: acceptances } = jobIds.length
    ? await sb.from('job_acceptances')
        .select('job_id, cleaner_id, acceptance_status, sms_sent_at, responded_at')
        .in('job_id', jobIds)
    : { data: [] as Array<Record<string, unknown>> };

  // Names only for the people actually on these jobs.
  const peopleIds = new Set<string>();
  for (const j of jobs ?? []) {
    const job = j as Record<string, unknown>;
    if (job.cleaner_1_id) peopleIds.add(String(job.cleaner_1_id));
    if (job.cleaner_2_id) peopleIds.add(String(job.cleaner_2_id));
  }
  const { data: people } = peopleIds.size
    ? await sb.from('profiles').select('id, full_name').in('id', [...peopleIds])
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const nameOf = new Map((people ?? []).map((p) => [String(p.id), (p.full_name ?? '').trim() || 'Cleaner']));

  const acceptanceFor = new Map<string, string>();
  for (const a of acceptances ?? []) {
    const row = a as Record<string, unknown>;
    acceptanceFor.set(`${row.job_id}|${row.cleaner_id}`, String(row.acceptance_status));
  }

  const nowMs = Date.now();
  const shaped = (jobs ?? []).map((j) => {
    const job = j as Record<string, unknown>;
    const prop = (job.properties ?? {}) as Record<string, unknown>;
    const mine = String(job.cleaner_1_id ?? '') === cleanerId || String(job.cleaner_2_id ?? '') === cleanerId;
    const myAnswer = acceptanceFor.get(`${job.id}|${cleanerId}`) ?? null;

    const team = [job.cleaner_1_id, job.cleaner_2_id]
      .filter(Boolean)
      .map((id) => {
        const sid = String(id);
        return { id: sid, name: nameOf.get(sid) ?? 'Cleaner', answer: acceptanceFor.get(`${job.id}|${sid}`) ?? null };
      });

    // The 12-hour rule BJ set, expressed as an instant so the page does not
    // have to re-derive it and get the timezone wrong.
    const startsAt = `${job.scheduled_date}T${String(job.scheduled_time ?? '10:00:00').slice(0, 8)}+10:00`;
    const deadlineMs = new Date(startsAt).getTime() - 12 * 3600_000;

    return {
      id: job.id,
      date: job.scheduled_date,
      time: String(job.scheduled_time ?? '').slice(0, 5),
      minutes: job.estimated_duration ?? null,
      status: job.status,
      property: prop.property_name ?? 'Property',
      // Suburb only. The full address is on the job screen once they are on it;
      // a roster does not need to put every client's street on a public page.
      suburb: prop.suburb ?? null,
      back_to_back: job.is_back_to_back === true,
      owner_stay: job.is_owner_stay === true,
      team,
      mine,
      my_answer: mine ? myAnswer : null,
      // Only meaningful while they still owe an answer.
      answer_by: mine && myAnswer === 'pending' ? new Date(deadlineMs).toISOString() : null,
      overdue: mine && myAnswer === 'pending' && deadlineMs < nowMs,
      unfilled: team.length === 0,
    };
  });

  // Best-effort: a failed timestamp must never stop someone seeing their week.
  await sb.from('cleaner_roster_tokens').update({ last_viewed_at: new Date().toISOString() }).eq('id', tok.id);

  return json({
    ok: true,
    viewer: { name: (me?.full_name ?? '').trim() || 'You', sees_everyone: seesEveryone },
    from,
    to,
    today: localDate(0),
    jobs: shaped,
  });
});
