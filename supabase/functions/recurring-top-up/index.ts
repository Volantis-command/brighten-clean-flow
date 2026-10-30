// recurring-top-up
//
// Keeps every running series stocked with cleans, so recurring work can never
// silently stop.
//
// Before this existed, the ONLY thing that created the next clean was
// job-completed-sms, firing when a cleaner finished a job. If a clean was never
// marked complete, or was cancelled, or the property had no client link, or the
// client had no phone saved, the chain ended and nobody was told. Joy lost her
// fortnightly that way (BJ, 30 Oct 2026).
//
// This runs nightly and works off the series itself, not off completions:
//   - every series whose end_date is today or later (or has none)
//   - fills in missing dates on cadence, up to HORIZON_DAYS ahead
//   - copies the day, time, duration, price and cleaner from the most recent
//     clean in that series, so a change made on the calendar carries forward
//   - skips any date that already has a live clean in that series
//   - never creates anything in the past, and never past the end date
//
// It is safe to run repeatedly: the unique index on (series_id, scheduled_date)
// plus the explicit date check make a second run a no-op.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** How far ahead the calendar should always be stocked. */
const HORIZON_DAYS = 365;
/** Warn when a series is about to run out, so it can be renewed deliberately. */
const RUNNING_OUT_DAYS = 30;
/** A series that has somehow fallen far behind is reported, not back-filled. */
const MAX_PER_SERIES = 60;

const LIVE = ['pending_cleaner', 'awaiting_cleaner_acceptance', 'scheduled', 'confirmed', 'in_progress'];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
/** Calendar months, so "monthly" on the 4th stays on the 4th. */
const addMonths = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return ymd(d);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const dryRun = body.dry_run === true;

  const today = ymd(new Date(Date.now() + 10 * 60 * 60 * 1000)); // Gold Coast
  const horizon = addDays(today, HORIZON_DAYS);
  const results: any[] = [];

  try {
    let q = supabase
      .from('job_series')
      .select('id, property_id, frequency, interval_weeks, start_date, end_date, cleaner_1_id, price_ex_gst, notes')
      .or(`end_date.is.null,end_date.gte.${today}`);
    if (body.series_id) q = q.eq('id', body.series_id);
    const { data: series, error: seriesErr } = await q;
    if (seriesErr) throw seriesErr;

    for (const s of series || []) {
      const stopAt = s.end_date && s.end_date < horizon ? s.end_date : horizon;

      // The next clean coming up is the template: it carries any change made on
      // the calendar (time moved, cleaner swapped, price raised). If the series
      // has run dry, fall back to the last one that happened.
      const fields = 'id, scheduled_date, scheduled_time, estimated_duration, cleaner_1_id, cleaner_2_id, price_ex_gst, price_inc_gst, notes, status';
      const { data: upcoming } = await supabase
        .from('jobs').select(fields)
        .eq('series_id', s.id).gte('scheduled_date', today)
        .in('status', LIVE)
        .order('scheduled_date', { ascending: true }).limit(1);
      let template: any = upcoming?.[0] || null;
      if (!template) {
        const { data: past } = await supabase
          .from('jobs').select(fields)
          .eq('series_id', s.id).lt('scheduled_date', today)
          .order('scheduled_date', { ascending: false }).limit(1);
        template = past?.[0] || null;
      }

      // Every date already spoken for, so a cancelled clean is not silently
      // replaced and a live one is never duplicated.
      const { data: existing } = await supabase
        .from('jobs')
        .select('scheduled_date, status')
        .eq('series_id', s.id)
        .gte('scheduled_date', today);
      const taken = new Set((existing || []).map((j: any) => j.scheduled_date));

      const monthly = Number(s.interval_weeks) === 4 && String(s.frequency).toLowerCase() === 'monthly';
      const step = (iso: string) => (monthly ? addMonths(iso, 1) : addDays(iso, Number(s.interval_weeks || 1) * 7));

      // Walk the cadence from the EARLIEST live clean, not the latest, so a hole
      // in the middle of the year gets filled and not just the far end. Falling
      // back to the series start keeps dates on the agreed weekday.
      const anchor = upcoming?.[0]?.scheduled_date || s.start_date;
      let cursor = anchor;
      // Wind forward to today without creating anything historical.
      let guard = 0;
      while (cursor < today && guard++ < 500) cursor = step(cursor);

      const toCreate: string[] = [];
      while (cursor <= stopAt && toCreate.length < MAX_PER_SERIES) {
        if (!taken.has(cursor)) toCreate.push(cursor);
        cursor = step(cursor);
      }

      const endsIn = s.end_date
        ? Math.round((new Date(s.end_date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000)
        : null;

      if (!toCreate.length) {
        results.push({
          series_id: s.id, created: 0,
          running_out: endsIn !== null && endsIn <= RUNNING_OUT_DAYS ? `ends in ${endsIn} days` : undefined,
        });
        continue;
      }

      if (dryRun) {
        results.push({ series_id: s.id, would_create: toCreate.length, first: toCreate[0], last: toCreate[toCreate.length - 1] });
        continue;
      }

      const rows = toCreate.map((date) => ({
        property_id: s.property_id,
        scheduled_date: date,
        scheduled_time: template?.scheduled_time ?? null,
        estimated_duration: template?.estimated_duration ?? null,
        // Born the same way the rest of the series lives, so the calendar reads
        // the same and the cleaner is not asked to re-accept a standing booking.
        status: (template?.cleaner_1_id || s.cleaner_1_id) ? 'confirmed' : 'pending_cleaner',
        source: 'recurring',
        frequency: s.frequency,
        approval_status: 'approved',
        series_id: s.id,
        cleaner_1_id: template?.cleaner_1_id ?? s.cleaner_1_id ?? null,
        cleaner_2_id: template?.cleaner_2_id ?? null,
        price_ex_gst: template?.price_ex_gst ?? s.price_ex_gst ?? null,
        price_inc_gst: template?.price_inc_gst ?? null,
        notes: template?.notes ?? s.notes ?? null,
      }));

      // One at a time: a single refusal (a cleaner on leave on one date) must
      // not throw away the rest of the year.
      let created = 0;
      const refused: any[] = [];
      for (const row of rows) {
        const { error } = await supabase.from('jobs').insert(row as any);
        if (error) refused.push({ date: row.scheduled_date, reason: error.message });
        else created++;
      }

      results.push({
        series_id: s.id,
        created,
        refused: refused.length ? refused : undefined,
        running_out: endsIn !== null && endsIn <= RUNNING_OUT_DAYS ? `ends in ${endsIn} days` : undefined,
      });
    }

    // Anything refused, or any series about to run out, is worth an admin's
    // attention rather than a line in a log nobody reads.
    const needsEyes = results.filter((r) => r.refused || r.running_out);
    if (!dryRun && needsEyes.length) {
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins?.length) {
        const refusedCount = needsEyes.filter((r) => r.refused).length;
        const endingCount = needsEyes.filter((r) => r.running_out).length;
        await supabase.from('notifications').insert(admins.map(({ user_id }: any) => ({
          user_id,
          title: 'Recurring cleans need a look',
          message: [
            refusedCount ? `${refusedCount} series could not book every date (usually a cleaner is away).` : '',
            endingCount ? `${endingCount} series run out within ${RUNNING_OUT_DAYS} days.` : '',
          ].filter(Boolean).join(' '),
          type: 'recurring_attention',
          event_type: 'recurring_attention',
          tier: 'important',
          link: '/schedule',
          read: false,
          metadata: { results: needsEyes },
        })));
      }
    }

    const created = results.reduce((s, r) => s + (r.created || 0), 0);
    console.log(`recurring-top-up: ${series?.length || 0} series, ${created} cleans created`);
    return new Response(JSON.stringify({ ok: true, today, horizon, series: series?.length || 0, created, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('recurring-top-up error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
