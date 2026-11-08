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
async function getAccessToken(): Promise<string> {
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
    // Deliberately does not echo the body: a failed token response can quote
    // the credentials back, and this lands in function logs.
    throw new Error(`Guesty rejected the credentials (${resp.status})`);
  }
  const data = await resp.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Guesty returned no access_token');
  return data.access_token;
}

async function fetchAllReservations(token: string): Promise<GuestyReservation[]> {
  const out: GuestyReservation[] = [];
  const limit = 100;
  for (let page = 0; page < 100; page += 1) {
    const url = new URL('https://open-api.guesty.com/v1/reservations');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('skip', String(page * limit));
    url.searchParams.set('fields', 'checkIn checkOut status listingId guest confirmationCode source integration');
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      throw new Error(`Guesty /reservations failed (${resp.status}): ${await resp.text()}`);
    }
    const body = await resp.json() as { results?: GuestyReservation[]; count?: number };
    const rows = Array.isArray(body.results) ? body.results : [];
    out.push(...rows);
    if (rows.length < limit) break;
    if (typeof body.count === 'number' && out.length >= body.count) break;
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
    .select('id, property_name, client_name, checkout_time, default_price, price_includes_gst, guesty_listing_id')
    .not('guesty_listing_id', 'is', null);
  if (mapErr) return json({ error: 'Failed to load mapped properties', detail: mapErr.message }, 500);

  const byListing = new Map<string, any>();
  for (const p of mapped || []) byListing.set(String(p.guesty_listing_id), p);
  if (byListing.size === 0) {
    return json({ error: 'No Brightly property has a guesty_listing_id — nothing to sync' }, 400);
  }

  let reservations: GuestyReservation[];
  try {
    const token = await getAccessToken();
    reservations = await fetchAllReservations(token);
  } catch (error) {
    return json({ error: 'Guesty sync failed', detail: (error as Error).message }, 502);
  }

  const results: Result[] = [];

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
    const JOB_COLS = 'id, status, scheduled_date, scheduled_time, property_id, source, source_external_refs, source_turnover_key';
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
    const arrival = localParts(r.checkIn)?.date;
    const notes = `Guesty turnover — ${guestName}\n${channel}${arrival ? ` · stay started ${arrival}` : ''}`;
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
      // An adopted job keeps the date and time a human chose for it.
      const dateChanged = !adoptedManual && existingJob.scheduled_date !== scheduledDate;
      const timeChanged = !adoptedManual && existingJob.scheduled_time !== scheduledTime;
      const shouldRevive = existingJob.status === 'cancelled';
      const refsChanged = refs.length !== (existingJob.source_external_refs || []).length;

      if (!dateChanged && !timeChanged && !shouldRevive && !refsChanged && !adoptedManual) {
        results.push({ reservation_id: reservationId, listing_id: listingId, checkout_date: scheduledDate, property_name: property.property_name, guest_name: guestName, status: 'no_op_unchanged', job_id: existingJob.id });
        continue;
      }

      const update: Record<string, unknown> = {
        source_turnover_key: turnoverKey,
        source_external_refs: refs,
        source_synced_at: new Date().toISOString(),
        guesty_reservation_id: reservationId,
      };
      if (!adoptedManual) {
        update.scheduled_date = scheduledDate;
        update.scheduled_time = scheduledTime;
        update.notes = notes;
        update.status = shouldRevive ? 'pending_cleaner' : existingJob.status;
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
        price_ex_gst: priceExGst,
        price_inc_gst: priceIncGst,
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
    summary,
    results,
  });
});
