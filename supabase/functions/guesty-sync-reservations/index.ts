// Guesty reservation sync — pulls checkouts from the connected Guesty
// account and turns each one into a Brightly turnover job.
//
// Modelled directly on hostaway-sync-reservations, which has been in
// production longest and has had the duplicate bugs beaten out of it. The
// differences from that function are all forced by Guesty, and each is
// commented where it happens.
//
// THE ALLOWLIST IS THE DATA, NOT A SETTING.
// The Guesty account holds 46 listings. Brightly cleans 7 of them. A job can
// only be created for a listing that some Brightly property carries in
// properties.guesty_listing_id, so the other 39 cannot produce work no matter
// what the account does. Onboarding an eighth property is one UPDATE, and
// losing one is clearing that column — there is no second list to keep in
// step, which is the part that rots.
//
// Defaults to today -> today+60 days by checkout date.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  dateInTimeZone,
  guestyTurnoverKey,
  isCancelledStay,
  isConfirmedGuestyStay,
  mergeExternalRefs,
} from '../_shared/turnover-integrity.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface Body {
  from_date?: string;   // YYYY-MM-DD, default today in Brisbane
  to_date?: string;     // YYYY-MM-DD, default today + 60
  dry_run?: boolean;    // report what would happen, write nothing
}

interface GuestyReservation {
  _id?: string;
  confirmationCode?: string;
  listingId?: string;
  listing?: { _id?: string };
  checkIn?: string;
  checkOut?: string;
  status?: string;
  guest?: { fullName?: string };
  source?: string;
  integration?: { platform?: string };
}

type Outcome =
  | 'created' | 'updated' | 'adopted_manual' | 'cancelled'
  | 'no_op_unchanged' | 'no_op_completed' | 'no_property'
  | 'skipped_out_of_range' | 'skipped_no_checkout' | 'skipped_unconfirmed'
  | 'skipped_past' | 'merged_duplicate' | 'error';

interface Result {
  reservation_id: string;
  listing_id: string | null;
  checkout_date: string | null;
  property_name?: string;
  guest_name: string;
  status: Outcome;
  job_id: string | null;
  error?: string;
}

function todayPlusDays(days: number): string {
  return dateInTimeZone('Australia/Brisbane', days);
}

// All 7 properties are NSW (Kingscliff, Casuarina, Terranora), which observes
// daylight saving. Brisbane does not, so from October to April the two are an
// hour apart. A checkout is mid-morning either way, so the hour never moves
// the date, but the TIME written on the job would be an hour early under
// Brisbane, and 09:00 is not when the guest leaves.
const PROPERTY_TZ = 'Australia/Sydney';

// GUESTY RETURNS UTC INSTANTS, NOT LOCAL DATES.
//
// A 10:00 checkout in NSW comes back as "2026-11-10T23:00:00.000Z" — the
// previous calendar day in UTC. Taking the first 10 characters of that string,
// which is the obvious thing to do and what this function did first, dates
// every single clean ONE DAY EARLY.
//
// Caught before any of this ran: BJ's hand-booked jobs sat exactly one day
// after every date the naive parse produced, across 8 of 8 comparable jobs.
// The bookings were right and the parse was wrong. Hostaway is not affected —
// it sends plain 'YYYY-MM-DD' departure dates with no time component at all,
// which is why that function slices and this one must not.
function localParts(iso: string | undefined | null): { date: string; time: string } | null {
  if (!iso) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROPERTY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instant);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  if (!v.year || !v.month || !v.day) return null;
  return {
    date: `${v.year}-${v.month}-${v.day}`,
    time: `${v.hour === '24' ? '00' : v.hour}:${v.minute}`,
  };
}

// Guesty access tokens last 24 hours, unlike Hostaway's long-lived ones. There
// is nothing worth caching for that long in a function that runs on a
// schedule, so this mints a fresh one per run and never stores the secret
// anywhere but the environment.
/**
 * A Guesty bearer token, reusing the cached one wherever possible.
 *
 * GUESTY ALLOWS ONLY FIVE TOKEN MINTS PER DAY. The limit is not documented
 * anywhere obvious; it comes back on the 429 as `x-ratelimit-limit-day: 5`
 * with a reset roughly 16 hours out. Each token is then valid for 24 hours.
 *
 * So minting one per invocation, as the first version did, means the whole
 * integration is five calls away from being dead until tomorrow, and a dry
 * run plus a real run spends two of them. Debugging spent all five and locked
 * this out for a day.
 *
 * The cache is therefore not a performance nicety, it is what keeps the
 * integration alive. A token is reused until ten minutes before it expires,
 * and if minting is refused we fall back to a cached token that is merely
 * near expiry rather than failing, because a token good for one more minute
 * still completes a sync.
 */
async function getAccessToken(
  // deno-lint-ignore no-explicit-any
  sb: any,
): Promise<string> {
  const now = Date.now();
  const SKEW_MS = 10 * 60 * 1000;

  const { data: cached } = await sb
    .from('guesty_tokens')
    .select('access_token, expires_at')
    .eq('id', 'default')
    .maybeSingle();

  const cachedExpiry = cached?.expires_at ? new Date(cached.expires_at).getTime() : 0;
  if (cached?.access_token && cachedExpiry > now + SKEW_MS) {
    return cached.access_token as string;
  }

  const clientId = Deno.env.get('GUESTY_CLIENT_ID');
  const clientSecret = Deno.env.get('GUESTY_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Server missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET');
  }

  const resp = await fetch('https://open-api.guesty.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'open-api',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!resp.ok) {
    // A token still in date beats failing the sync, even if it is inside the
    // ten-minute skew window we would normally refresh within.
    if (cached?.access_token && cachedExpiry > now) {
      console.warn(`Guesty token mint refused (${resp.status}); using cached token near expiry`);
      return cached.access_token as string;
    }
    if (resp.status === 429) {
      const resetSeconds = Number(resp.headers.get('retry-after') ?? 0);
      const hours = resetSeconds ? (resetSeconds / 3600).toFixed(1) : 'unknown';
      throw new Error(
        `Guesty token limit reached: 5 mints per day, none left, resets in ${hours}h. No usable cached token.`,
      );
    }
    // Deliberately does not echo the body: a failed token response can quote
    // the credentials back, and this lands in function logs.
    throw new Error(`Guesty rejected the credentials (${resp.status})`);
  }

  const data = await resp.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Guesty returned no access_token');

  // Guesty reports expires_in in seconds; fall back to 24h, which is what it
  // has always returned, but trust the response when it says otherwise.
  const lifetimeMs = (data.expires_in && data.expires_in > 0 ? data.expires_in : 86400) * 1000;
  const { error: cacheErr } = await sb.from('guesty_tokens').upsert({
    id: 'default',
    access_token: data.access_token,
    expires_at: new Date(now + lifetimeMs).toISOString(),
    updated_at: new Date(now).toISOString(),
  });
  // A cache write failure must not fail the sync, but it does mean the next
  // run spends another of the five, so it is worth shouting about.
  if (cacheErr) console.error('Could not cache Guesty token:', cacheErr.message);

  return data.access_token;
}

/**
 * How long the clean is booked for, in minutes.
 *
 * properties.estimated_hours is the agreed figure per property (Ohana 4h,
 * Elysian 7.5h, Magnolia 3.5h). It has to be stamped onto the job by BOTH the
 * create and the update path. Leaving it off does not leave the job blank —
 * serviceTypes.ts falls back to a base of 1.5 hours, so the job shows a
 * confident wrong number, and cleaners plan their day off it while payroll
 * reads it. A wrong default is worse than an empty field.
 *
 * This exists as one function precisely because the first fix only patched
 * the update path and shipped, leaving every newly created clean at 1.5h.
 */
// deno-lint-ignore no-explicit-any
function durationFields(property: any): Record<string, number> {
  const hours = Number(property?.estimated_hours);
  if (!Number.isFinite(hours) || hours <= 0) return {};
  const minutes = Math.round(hours * 60);
  return { estimated_duration: minutes, duration_minutes: minutes };
}

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Every reservation checking out inside the window.
 *
 * Two things here are load-bearing and were both wrong in the first version.
 *
 * 1. ASK GUESTY FOR THE WINDOW. The original fetched the entire account
 *    unfiltered and sifted in memory. That is tens of thousands of rows for a
 *    busy account, and the only reason it appeared to work is that it quit
 *    early (see 2). The window is padded a day on each side because checkOut
 *    is a UTC instant and we care about the local date: a 10:00 Sydney
 *    checkout on the first day of the window is 23:00 UTC the day before.
 *    The exact local-date test downstream still does the real trimming.
 *
 * 2. A SHORT PAGE DOES NOT MEAN THE END. Guesty will hand back fewer than
 *    `limit` rows and still have more behind them, so `rows.length < limit`
 *    as a stop condition silently truncates the sync. It stopped at 348 of
 *    649 against this account and dropped a confirmed booking that already
 *    had a cleaner assigned. Page until the reported `count` is reached, and
 *    only treat an empty page as the end.
 */
async function fetchAllReservations(
  token: string,
  fromDate: string,
  toDate: string,
  dateField: 'checkOut' | 'checkIn' = 'checkOut',
): Promise<GuestyReservation[]> {
  const out: GuestyReservation[] = [];
  const seen = new Set<string>();
  const limit = 100;
  const filters = JSON.stringify([
    { field: dateField, operator: '$gte', value: shiftDays(fromDate, -1) },
    { field: dateField, operator: '$lte', value: `${shiftDays(toDate, 1)}T23:59:59.999Z` },
  ]);
  let total = Number.POSITIVE_INFINITY;

  for (let page = 0; page < 200; page += 1) {
    const url = new URL('https://open-api.guesty.com/v1/reservations');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('skip', String(page * limit));
    url.searchParams.set('sort', dateField);
    url.searchParams.set('filters', filters);
    url.searchParams.set('fields', 'checkIn checkOut status listingId guest confirmationCode source integration');
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      throw new Error(`Guesty /reservations failed (${resp.status}): ${await resp.text()}`);
    }
    const body = await resp.json() as { results?: GuestyReservation[]; count?: number };
    const rows = Array.isArray(body.results) ? body.results : [];
    if (typeof body.count === 'number') total = body.count;

    // Paging an unstable sort can repeat a row; the turnover key would catch
    // it later, but de-duplicating here keeps the reported counts honest.
    for (const r of rows) {
      const id = String((r as { _id?: string })._id ?? '');
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(r);
    }

    if (rows.length === 0) break;
    if (out.length >= total) break;
  }

  if (Number.isFinite(total) && out.length < total) {
    throw new Error(
      `Guesty returned ${out.length} of ${total} ${dateField} reservations; refusing to sync a partial set`,
    );
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: Body = {};
  if (req.method === 'POST') {
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) as Body : {};
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
  }

  const fromDate = body.from_date && /^\d{4}-\d{2}-\d{2}$/.test(body.from_date)
    ? body.from_date
    : todayPlusDays(0);
  const toDate = body.to_date && /^\d{4}-\d{2}-\d{2}$/.test(body.to_date)
    ? body.to_date
    : todayPlusDays(60);
  if (fromDate > toDate) return json({ error: 'from_date must be on or before to_date' }, 400);
  const dryRun = body.dry_run === true;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Load the allowlist once. Pulling every mapped property up front means the
  // 39 unmapped listings are discarded in memory without a query each, and it
  // is one place to read when asking what this sync is allowed to touch.
  const { data: mapped, error: mapErr } = await sb
    .from('properties')
    .select('id, property_name, client_name, checkout_time, default_price, price_includes_gst, estimated_hours, guesty_listing_id')
    .not('guesty_listing_id', 'is', null);
  if (mapErr) return json({ error: 'Failed to load mapped properties', detail: mapErr.message }, 500);

  const byListing = new Map<string, any>();
  for (const p of mapped || []) byListing.set(String(p.guesty_listing_id), p);
  if (byListing.size === 0) {
    return json({ error: 'No Brightly property has a guesty_listing_id — nothing to sync' }, 400);
  }

  let reservations: GuestyReservation[];
  let arrivalRes: GuestyReservation[];
  try {
    const token = await getAccessToken(sb);
    // Departures are what create the clean. Arrivals are what make that clean
    // a BACK TO BACK, and Guesty will not tell you about one while you are
    // asking about the other: the checkOut filter returns the departing stay
    // only, whose own `checkIn` is when THAT guest arrived, days earlier. So
    // the next guest has to be fetched separately, over the same window.
    //
    // Both calls share the one token, so this does not cost a second mint
    // against Guesty's limit of 5 a day.
    [reservations, arrivalRes] = await Promise.all([
      fetchAllReservations(token, fromDate, toDate, 'checkOut'),
      fetchAllReservations(token, fromDate, toDate, 'checkIn'),
    ]);
  } catch (error) {
    return json({ error: 'Guesty sync failed', detail: (error as Error).message }, 502);
  }

  // listing + local arrival date -> a guest walks in that day.
  //
  // The date MUST come from localParts, not from slicing the ISO string.
  // Guesty hands back a UTC instant, and a 14:00 Sydney check-in is 03:00 UTC
  // the same day while a 10:00 Sydney checkout is 23:00 UTC the day before —
  // slice either one and the two sides of this comparison stop lining up.
  const arrivalDays = new Set<string>();
  for (const a of arrivalRes) {
    if (!isConfirmedGuestyStay(a.status ?? '')) continue;
    const lid = a.listingId ? String(a.listingId) : (a.listing?._id ? String(a.listing._id) : null);
    const day = localParts(a.checkIn)?.date;
    if (lid && day) arrivalDays.add(`${lid}|${day}`);
  }

  const results: Result[] = [];
  const backToBacks: string[] = [];

  for (const r of reservations) {
    const reservationId = r._id ? String(r._id) : '';
    if (!reservationId) continue;

    const listingId = r.listingId ? String(r.listingId) : (r.listing?._id ? String(r.listing._id) : null);
    const checkoutLocal = localParts(r.checkOut);
    const checkoutDate = checkoutLocal?.date ?? null;
    const guestName = r.guest?.fullName?.trim() || 'Guest';
    const status = r.status ?? '';
    const isCancellation = isCancelledStay(status);

    // Drop anything outside the allowlist before any other work. A listing
    // Brightly does not clean is not an error and is not reported — 39 of
    // these every run would bury the rows that matter.
    const property = listingId ? byListing.get(listingId) : null;
    if (!property) continue;

    if (!checkoutDate && !isCancellation) {
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: null, property_name: property.property_name, guest_name: guestName, status: 'skipped_no_checkout', job_id: null });
      continue;
    }

    if (checkoutDate && !isCancellation && (checkoutDate < fromDate || checkoutDate > toDate)) {
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'skipped_out_of_range', job_id: null });
      continue;
    }

    // Find an existing job for this reservation: by id first, then by the
    // external refs array. limit(1) over an ordered select rather than
    // maybeSingle(), because maybeSingle() throws on pre-existing duplicates
    // and the old Hostaway code swallowed that and made another one.
    const JOB_COLS = 'id, status, scheduled_date, scheduled_time, property_id, source, source_external_refs, source_turnover_key, flags_source, is_back_to_back';
    const { data: byId, error: byIdErr } = await sb
      .from('jobs').select(JOB_COLS)
      .eq('guesty_reservation_id', reservationId)
      .order('created_at', { ascending: true }).limit(1);
    if (byIdErr) {
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'error', job_id: null, error: `Job lookup failed: ${byIdErr.message}` });
      continue;
    }
    let existingJob: any = byId?.[0] ?? null;

    if (!existingJob) {
      const { data: byRef, error: byRefErr } = await sb
        .from('jobs').select(JOB_COLS)
        .contains('source_external_refs', [reservationId])
        .order('created_at', { ascending: true }).limit(1);
      if (byRefErr) {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'error', job_id: null, error: `Reference lookup failed: ${byRefErr.message}` });
        continue;
      }
      existingJob = byRef?.[0] ?? null;
    }

    if (!isCancellation && !isConfirmedGuestyStay(status) && !existingJob) {
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'skipped_unconfirmed', job_id: null });
      continue;
    }

    // Cancellation path
    if (isCancellation) {
      if (!existingJob) continue;
      if (existingJob.status === 'cancelled') {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'no_op_unchanged', job_id: existingJob.id });
        continue;
      }
      if (existingJob.status === 'completed') {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'no_op_completed', job_id: existingJob.id });
        continue;
      }
      // A job can cover two reservations that merged onto one checkout date.
      // Losing one of them leaves the clean standing, so only detach the ref.
      const remaining = (existingJob.source_external_refs || []).filter((ref: string) => ref !== reservationId);
      if (remaining.length > 0) {
        if (!dryRun) {
          await sb.from('jobs').update({ source_external_refs: remaining, source_synced_at: new Date().toISOString() }).eq('id', existingJob.id);
        }
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'no_op_unchanged', job_id: existingJob.id });
        continue;
      }
      if (!dryRun) {
        const { error: cancelErr } = await sb.from('jobs')
          .update({ status: 'cancelled', source_synced_at: new Date().toISOString() })
          .eq('id', existingJob.id);
        if (cancelErr) {
          results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'error', job_id: existingJob.id, error: `Cancel failed: ${cancelErr.message}` });
          continue;
        }
      }
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: checkoutDate, property_name: property.property_name, guest_name: guestName, status: 'cancelled', job_id: existingJob.id });
      continue;
    }

    const scheduledDate = checkoutDate!;
    // Brightly's own checkout_time wins where it is set, because that is the
    // time BJ has agreed with the client. Where it is not (Casa Luxe and
    // Elysian), fall back to the checkout time Guesty actually holds rather
    // than a hardcoded 10:00 — it is the same information, from the source.
    const rawTime = property.checkout_time ? String(property.checkout_time).slice(0, 5) : '';
    const scheduledTime = /^\d{2}:\d{2}$/.test(rawTime)
      ? rawTime
      : (checkoutLocal?.time ?? '10:00');
    const channel = r.integration?.platform || r.source || 'Guesty';
    // The DEPARTING guest's arrival, for the note only. Not to be confused
    // with the next guest's, which is what decides a back-to-back below.
    const stayStarted = localParts(r.checkIn)?.date;
    // Someone else walks in the day this clean happens. The cleaner has a
    // hard finish time rather than a whole day, which changes how the job is
    // staffed and how late it can start.
    const backToBack = !!listingId && arrivalDays.has(`${listingId}|${scheduledDate}`);
    if (backToBack) backToBacks.push(`${property.property_name} ${scheduledDate}`);
    const notes = [
      backToBack ? 'BACK TO BACK - guest checking in the same day. Must be finished and guest-ready on time.' : '',
      `Guesty turnover — ${guestName}`,
      `${channel}${stayStarted ? ` · stay started ${stayStarted}` : ''}`,
    ].filter(Boolean).join('\n');
    const turnoverKey = guestyTurnoverKey(property.id, scheduledDate);

    let adoptedManual = false;
    if (!existingJob) {
      const { data: byKey, error: keyErr } = await sb
        .from('jobs').select(JOB_COLS).eq('source_turnover_key', turnoverKey).limit(1);
      if (keyErr) {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'error', job_id: null, error: `Turnover lookup failed: ${keyErr.message}` });
        continue;
      }
      existingJob = byKey?.[0] ?? null;
    }

    // THE ONE REAL DEPARTURE FROM THE HOSTAWAY FUNCTION.
    //
    // These 7 properties were already being cleaned before the sync existed,
    // booked by hand. Those jobs carry no source_turnover_key and no
    // reservation id, so every lookup above misses them, and a first run would
    // have put a second clean on a date that already had one. Hostaway never
    // hit this because those properties were connected before anyone booked
    // them manually.
    //
    // So before creating anything, look for a live job already standing on
    // this property and date from any source, and adopt it: stamp the key and
    // the reservation onto the job that is already there. Date and price are
    // left exactly as booked — whoever entered it knew something Guesty does
    // not, and an adopted job that then moves in Guesty is handled by the
    // normal update path on the next run.
    if (!existingJob) {
      const { data: sameDay, error: sameDayErr } = await sb
        .from('jobs').select(JOB_COLS)
        .eq('property_id', property.id)
        .eq('scheduled_date', scheduledDate)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }).limit(1);
      if (sameDayErr) {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'error', job_id: null, error: `Same-day lookup failed: ${sameDayErr.message}` });
        continue;
      }
      if (sameDay?.[0]) {
        existingJob = sameDay[0];
        adoptedManual = true;
      }
    }

    if (!existingJob && scheduledDate < todayPlusDays(0)) {
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'skipped_past', job_id: null });
      continue;
    }

    if (existingJob) {
      if (existingJob.status === 'completed') {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'no_op_completed', job_id: existingJob.id });
        continue;
      }

      const refs = mergeExternalRefs(existingJob.source_external_refs, reservationId);

      // A job a human booked, whether adopted on this run or on an earlier
      // one. `adoptedManual` alone is not enough: it is true only on the run
      // that first adopts the job, so from the next run on the sync treated
      // these as its own and rewrote them.
      //
      // That is not theoretical. These 7 properties were booked by hand on
      // 23 Oct, and on 18 Nov a run reset five of them to the property
      // defaults — Elysian moved from the 12:30 start BJ had chosen to 10:00,
      // and from 4 hours to 7.5 — on jobs whose cleaners had already accepted
      // the original time. The offer said one thing and the app said another.
      //
      // The date still follows the booking, because a clean on the day after
      // the guest leaves is no clean at all. The time, the duration and the
      // notes are a human's call and stay put.
      const humanBooked = adoptedManual || String(existingJob.source ?? '') === 'manual';

      const dateChanged = !adoptedManual && existingJob.scheduled_date !== scheduledDate;
      const timeChanged = !humanBooked && existingJob.scheduled_time !== scheduledTime;
      const shouldRevive = existingJob.status === 'cancelled';
      const refsChanged = refs.length !== (existingJob.source_external_refs || []).length;
      // A human flag beats a computed one, so a nightly run never undoes what
      // an admin ticked by hand.
      const flagsAreOurs = String(existingJob.flags_source ?? 'auto') !== 'manual';
      const b2bChanged = flagsAreOurs && !!existingJob.is_back_to_back !== backToBack;

      // b2bChanged belongs in this guard. Without it the flag is only ever
      // written on a run where the date, time or refs also moved — which for
      // a booking that was already synced is never, so the first guest to
      // book the turnaround day would silently stay unflagged.
      if (!dateChanged && !timeChanged && !shouldRevive && !refsChanged && !adoptedManual && !b2bChanged) {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'no_op_unchanged', job_id: existingJob.id });
        continue;
      }

      const update: Record<string, unknown> = {
        source_turnover_key: turnoverKey,
        source_external_refs: refs,
        source_synced_at: new Date().toISOString(),
        guesty_reservation_id: reservationId,
      };
      if (!humanBooked) {
        // The sync created this job, so the sync owns its shape.
        Object.assign(update, durationFields(property));
        update.scheduled_time = scheduledTime;
        update.notes = notes;
      }
      if (!adoptedManual) {
        update.scheduled_date = scheduledDate;
        update.status = shouldRevive ? 'pending_cleaner' : existingJob.status;
      }
      // Set on adopted jobs too. The date and time were a human's call; who
      // is checking in that day is not, it is a fact from the source.
      if (flagsAreOurs) {
        update.is_back_to_back = backToBack;
        update.flags_source = 'auto';
      }

      if (!dryRun) {
        const { error: updErr } = await sb.from('jobs').update(update).eq('id', existingJob.id);
        if (updErr) {
          results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'error', job_id: existingJob.id, error: `Update failed: ${updErr.message}` });
          continue;
        }
      }
      results.push({
        reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate,
        property_name: property.property_name, guest_name: guestName,
        status: adoptedManual ? 'adopted_manual' : (refs.length > 1 && !dateChanged && !timeChanged ? 'merged_duplicate' : 'updated'),
        job_id: existingJob.id,
      });
      continue;
    }

    // Price the job from the property defaults, so xero-auto-invoice-job has
    // something to bill. All 7 of these store an inc-GST figure.
    const rawPrice = Number(property.default_price) || 0;
    const includesGst = !!property.price_includes_gst;
    const priceExGst = rawPrice > 0 ? (includesGst ? +(rawPrice / 1.1).toFixed(2) : +rawPrice.toFixed(2)) : null;
    const priceIncGst = rawPrice > 0 ? (includesGst ? +rawPrice.toFixed(2) : +(rawPrice * 1.1).toFixed(2)) : null;

    if (dryRun) {
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'created', job_id: null });
      continue;
    }

    const { data: newJob, error: insErr } = await sb
      .from('jobs')
      .insert({
        property_id: property.id,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        status: 'pending_cleaner',
        frequency: 'one-off',
        source: 'guesty',
        service_type: 'Turnover Clean',
        service_type_inferred: false,
        guesty_reservation_id: reservationId,
        source_turnover_key: turnoverKey,
        source_external_refs: [reservationId],
        source_synced_at: new Date().toISOString(),
        client_name: property.client_name,
        notes,
        is_back_to_back: backToBack,
        flags_source: 'auto',
        price_ex_gst: priceExGst,
        price_inc_gst: priceIncGst,
        // Must be set on CREATE as well as update. A null duration does not
        // render as blank: the app falls back to a generic 1.5 hours, so a
        // 4 hour Ohana turnover showed as 1.5 and a cleaner planned their day
        // around it.
        ...durationFields(property),
      })
      .select('id')
      .single();

    if (insErr || !newJob?.id) {
      results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'error', job_id: null, error: `Job create failed: ${insErr?.message ?? 'no id returned'}` });
      continue;
    }

    results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'created', job_id: newJob.id });
  }

  const summary: Record<string, number> = {};
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1;

  return json({
    status: 'ok',
    dry_run: dryRun,
    from_date: fromDate,
    to_date: toDate,
    mapped_properties: byListing.size,
    reservations_seen: reservations.length,
    arrivals_seen: arrivalRes.length,
    back_to_back: backToBacks.sort(),
    summary,
    results,
  });
});
