// Resly reservation sync — pulls Coastal Holiday Homes' checkouts and turns
// each one into a Brightly turnover job.
//
// Built after 17 Nov 2026, when 10 of 15 upcoming Coastal cleans were missing
// from the app including Reflections 1501 the following morning, because every
// one of them was being typed in by hand off a list Leanne emailed.
//
// THE ALLOWLIST IS THE DATA, NOT A SETTING.
// Coastal manage 8 rooms in Resly. Brightly cleans 2 of them. A job can only
// be created for a room some property carries in properties.resly_room_id, so
// the other 6 cannot produce work no matter what the account does.
//
// TWO DIFFERENCES FROM THE GUESTY SYNC, both in Brightly's favour:
//   1. Resly returns PLAIN DATES ('2026-11-17'), not UTC instants, so the
//      one-day-early trap that bit the Guesty sync cannot happen here. Do not
//      port the timezone handling across.
//   2. No daily cap on tokens. Guesty allows 5 mints a day; Resly's token
//      simply lasts 24h, so minting one per run is fine.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  dateInTimeZone,
  isCancelledStay,
  isConfirmedReslyStay,
  isOwnerBooking,
  mergeExternalRefs,
  reslyTurnoverKey,
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
  from_date?: string;
  to_date?: string;
  dry_run?: boolean;
}

interface ReslyReservation {
  reservationId?: string;
  reservationRef?: string;
  roomId?: string;
  roomName?: string;
  status?: string;
  checkIn?: string;
  checkOut?: string;
  agentId?: string;
  agentName?: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestName?: string;
}

type Outcome =
  | 'created' | 'updated' | 'adopted_manual' | 'cancelled' | 'flags_updated'
  | 'no_op_unchanged' | 'no_op_completed'
  | 'skipped_out_of_range' | 'skipped_no_checkout' | 'skipped_unconfirmed'
  | 'skipped_past' | 'error';

interface Result {
  reservation_id: string;
  room_id: string | null;
  checkout_date: string | null;
  property_name?: string;
  guest_name: string;
  back_to_back?: boolean;
  owner_stay?: boolean;
  status: Outcome;
  job_id: string | null;
  error?: string;
}

const TZ = 'Australia/Brisbane';
const todayPlusDays = (d: number) => dateInTimeZone(TZ, d);

const BASE = 'https://api.resly.com.au';

/**
 * A Resly bearer token.
 *
 * The token endpoint is the only one that takes no Authorization header, and
 * it wants the account id and key as JSON. 24h life, no documented daily cap,
 * so this mints per run rather than carrying a cache table.
 */
async function getAccessToken(): Promise<string> {
  const accountId = Deno.env.get('RESLY_ACCOUNT_ID');
  const key = Deno.env.get('RESLY_API_KEY');
  if (!accountId || !key) throw new Error('Server missing RESLY_ACCOUNT_ID or RESLY_API_KEY');

  const resp = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, key }),
  });
  if (!resp.ok) {
    // Never echo the body: a rejected token response can quote the key back,
    // and this lands in function logs.
    if (resp.status === 403) throw new Error('Resly rejected the API key for this account (403)');
    throw new Error(`Resly token request failed (${resp.status})`);
  }
  const data = await resp.json() as { token?: string };
  if (!data.token) throw new Error('Resly returned no token');
  return data.token;
}

/** Reservations by checkIn or checkOut date. Resly caps a range at 365 days. */
async function fetchReservations(
  token: string, dateType: 'checkIn' | 'checkOut', startDate: string, endDate: string,
): Promise<ReslyReservation[]> {
  const url = new URL(`${BASE}/reservations`);
  url.searchParams.set('dateType', dateType);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Resly /reservations ${dateType} failed (${resp.status}): ${await resp.text()}`);
  const body = await resp.json() as { data?: ReslyReservation[]; count?: number };
  const rows = Array.isArray(body.data) ? body.data : [];
  // Resly documents no pagination and returns a count alongside the rows. If
  // those ever disagree we are silently dropping bookings, which is exactly
  // how the Guesty sync lost a confirmed clean, so refuse rather than guess.
  if (typeof body.count === 'number' && body.count !== rows.length) {
    throw new Error(`Resly returned ${rows.length} rows but a count of ${body.count}; refusing a partial set`);
  }
  return rows;
}

function guestNameOf(r: ReslyReservation): string {
  const joined = [r.guestFirstName, r.guestLastName].filter(Boolean).join(' ').trim();
  return (r.guestName || joined || 'Guest').trim();
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

  const fromDate = body.from_date && /^\d{4}-\d{2}-\d{2}$/.test(body.from_date) ? body.from_date : todayPlusDays(0);
  const toDate = body.to_date && /^\d{4}-\d{2}-\d{2}$/.test(body.to_date) ? body.to_date : todayPlusDays(60);
  if (fromDate > toDate) return json({ error: 'from_date must be on or before to_date' }, 400);
  const dryRun = body.dry_run === true;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server missing Supabase env' }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: mapped, error: mapErr } = await sb
    .from('properties')
    .select('id, property_name, client_name, estimated_hours, default_price, price_includes_gst, checkout_time, resly_room_id')
    .not('resly_room_id', 'is', null);
  if (mapErr) return json({ error: 'Failed to load mapped properties', detail: mapErr.message }, 500);

  const byRoom = new Map<string, Record<string, unknown>>();
  for (const p of mapped || []) byRoom.set(String(p.resly_room_id), p);
  if (byRoom.size === 0) {
    return json({ error: 'No Brightly property has a resly_room_id — nothing to sync' }, 400);
  }

  let checkouts: ReslyReservation[];
  let checkins: ReslyReservation[];
  try {
    const token = await getAccessToken();
    // Arrivals are fetched for the same window because they are what make a
    // checkout a back-to-back, and what says whether the owner is next in.
    [checkouts, checkins] = await Promise.all([
      fetchReservations(token, 'checkOut', fromDate, toDate),
      fetchReservations(token, 'checkIn', fromDate, toDate),
    ]);
  } catch (error) {
    return json({ error: 'Resly sync failed', detail: (error as Error).message }, 502);
  }

  // room + date -> the confirmed arrivals that day.
  const arrivals = new Map<string, ReslyReservation[]>();
  for (const r of checkins) {
    if (!isConfirmedReslyStay(r.status)) continue;
    if (!r.roomId || !r.checkIn) continue;
    const k = `${r.roomId}|${r.checkIn}`;
    const list = arrivals.get(k) ?? [];
    list.push(r);
    arrivals.set(k, list);
  }

  const results: Result[] = [];
  const JOB_COLS = 'id, status, scheduled_date, scheduled_time, property_id, source, source_external_refs, source_turnover_key, flags_source, is_back_to_back, is_owner_stay';

  for (const r of checkouts) {
    const reservationId = r.reservationId ? String(r.reservationId) : '';
    if (!reservationId) continue;
    const roomId = r.roomId ? String(r.roomId) : null;
    const property = roomId ? byRoom.get(roomId) : null;
    if (!property) continue; // not ours; not an error, and not reported

    const propertyId = String(property.id);
    const propertyName = String(property.property_name);
    const guestName = guestNameOf(r);
    const checkoutDate = r.checkOut || null;
    const cancelled = isCancelledStay(r.status ?? '');

    if (!checkoutDate) {
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: null, property_name: propertyName, guest_name: guestName, status: 'skipped_no_checkout', job_id: null });
      continue;
    }
    if (!cancelled && (checkoutDate < fromDate || checkoutDate > toDate)) {
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'skipped_out_of_range', job_id: null });
      continue;
    }

    const turnoverKey = reslyTurnoverKey(propertyId, checkoutDate);

    // Find an existing job: by reservation ref, then by turnover key, then by
    // a live job already standing on that property and date from any source.
    // That last one is what stops a first run doubling up on every clean
    // somebody already entered by hand.
    let existingJob: Record<string, unknown> | null = null;
    let adoptedManual = false;

    const { data: byRef, error: refErr } = await sb.from('jobs').select(JOB_COLS)
      .contains('source_external_refs', [reservationId])
      .order('created_at', { ascending: true }).limit(1);
    if (refErr) {
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'error', job_id: null, error: `Reference lookup failed: ${refErr.message}` });
      continue;
    }
    existingJob = byRef?.[0] ?? null;

    if (!existingJob) {
      const { data: byKey } = await sb.from('jobs').select(JOB_COLS)
        .eq('source_turnover_key', turnoverKey).limit(1);
      existingJob = byKey?.[0] ?? null;
    }
    if (!existingJob && !cancelled) {
      const { data: sameDay } = await sb.from('jobs').select(JOB_COLS)
        .eq('property_id', propertyId).eq('scheduled_date', checkoutDate)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }).limit(1);
      if (sameDay?.[0]) { existingJob = sameDay[0]; adoptedManual = true; }
    }

    if (cancelled) {
      if (!existingJob) continue;
      const st = String(existingJob.status);
      if (st === 'cancelled') { results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'no_op_unchanged', job_id: String(existingJob.id) }); continue; }
      if (st === 'completed') { results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'no_op_completed', job_id: String(existingJob.id) }); continue; }
      // Two reservations can share one checkout date. Losing one of them
      // leaves the clean standing, so only detach the reference.
      const remaining = ((existingJob.source_external_refs as string[]) || []).filter((x) => x !== reservationId);
      if (remaining.length > 0) {
        if (!dryRun) await sb.from('jobs').update({ source_external_refs: remaining, source_synced_at: new Date().toISOString() }).eq('id', existingJob.id);
        results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'no_op_unchanged', job_id: String(existingJob.id) });
        continue;
      }
      if (!dryRun) await sb.from('jobs').update({ status: 'cancelled', source_synced_at: new Date().toISOString() }).eq('id', existingJob.id);
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'cancelled', job_id: String(existingJob.id) });
      continue;
    }

    if (!isConfirmedReslyStay(r.status) && !existingJob) {
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'skipped_unconfirmed', job_id: null });
      continue;
    }

    const nextIn = arrivals.get(`${roomId}|${checkoutDate}`) ?? [];
    const backToBack = nextIn.length > 0;
    const ownerStay = nextIn.some((a) => isOwnerBooking(a.agentId));

    if (!existingJob && checkoutDate < todayPlusDays(0)) {
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'skipped_past', job_id: null });
      continue;
    }

    const hours = Number(property.estimated_hours);
    const minutes = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : null;
    const rawTime = property.checkout_time ? String(property.checkout_time).slice(0, 5) : '';
    const scheduledTime = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '10:00';
    const notes = [
      backToBack ? 'BACK TO BACK - guest checking in the same day. Must be finished and guest-ready on time.' : '',
      ownerStay ? 'OWNER ARRIVING - this clean gets inspected. Extra attention to detail.' : '',
      `Resly turnover — ${guestName}`,
      r.agentName ? `${r.agentName}${r.checkIn ? ` · stay started ${r.checkIn}` : ''}` : '',
    ].filter(Boolean).join('\n');

    if (existingJob) {
      if (String(existingJob.status) === 'completed') {
        results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'no_op_completed', job_id: String(existingJob.id) });
        continue;
      }
      const refs = mergeExternalRefs(existingJob.source_external_refs, reservationId);
      const update: Record<string, unknown> = {
        source_turnover_key: turnoverKey,
        source_external_refs: refs,
        source_synced_at: new Date().toISOString(),
      };
      // A human flag beats a computed one. Without this check the nightly run
      // quietly undoes whatever an admin ticked on the job.
      if (String(existingJob.flags_source ?? 'auto') !== 'manual') {
        update.is_back_to_back = backToBack;
        update.is_owner_stay = ownerStay;
        update.flags_source = 'auto';
      }
      // An adopted job keeps the date, time and notes a human chose.
      if (!adoptedManual) {
        update.scheduled_date = checkoutDate;
        update.scheduled_time = scheduledTime;
        update.notes = notes;
        if (minutes) { update.estimated_duration = minutes; update.duration_minutes = minutes; }
        if (String(existingJob.status) === 'cancelled') update.status = 'pending_cleaner';
      }
      if (!dryRun) {
        const { error: updErr } = await sb.from('jobs').update(update).eq('id', existingJob.id);
        if (updErr) {
          results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'error', job_id: String(existingJob.id), error: `Update failed: ${updErr.message}` });
          continue;
        }
      }
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, back_to_back: backToBack, owner_stay: ownerStay, status: adoptedManual ? 'adopted_manual' : 'updated', job_id: String(existingJob.id) });
      continue;
    }

    const rawPrice = Number(property.default_price) || 0;
    const incGst = !!property.price_includes_gst;
    const priceEx = rawPrice > 0 ? (incGst ? +(rawPrice / 1.1).toFixed(2) : +rawPrice.toFixed(2)) : null;
    const priceInc = rawPrice > 0 ? (incGst ? +rawPrice.toFixed(2) : +(rawPrice * 1.1).toFixed(2)) : null;

    if (dryRun) {
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, back_to_back: backToBack, owner_stay: ownerStay, status: 'created', job_id: null });
      continue;
    }

    const { data: newJob, error: insErr } = await sb.from('jobs').insert({
      property_id: propertyId,
      scheduled_date: checkoutDate,
      scheduled_time: scheduledTime,
      status: 'pending_cleaner',
      frequency: 'one-off',
      source: 'resly',
      service_type: 'Turnover Clean',
      service_type_inferred: false,
      source_turnover_key: turnoverKey,
      source_external_refs: [reservationId],
      source_synced_at: new Date().toISOString(),
      client_name: property.client_name,
      notes,
      price_ex_gst: priceEx,
      price_inc_gst: priceInc,
      is_back_to_back: backToBack,
      is_owner_stay: ownerStay,
      flags_source: 'auto',
      // Must be set on CREATE as well as update: a null duration is not shown
      // as blank, the app falls back to a generic 1.5 hours and the job
      // displays a confident wrong number.
      ...(minutes ? { estimated_duration: minutes, duration_minutes: minutes } : {}),
    }).select('id').single();

    if (insErr || !newJob?.id) {
      results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, status: 'error', job_id: null, error: `Job create failed: ${insErr?.message ?? 'no id returned'}` });
      continue;
    }
    results.push({ reservation_id: reservationId, room_id: roomId, checkout_date: checkoutDate, property_name: propertyName, guest_name: guestName, back_to_back: backToBack, owner_stay: ownerStay, status: 'created', job_id: String(newJob.id) });
  }

  const summary: Record<string, number> = {};
  for (const x of results) summary[x.status] = (summary[x.status] ?? 0) + 1;

  return json({
    status: 'ok',
    dry_run: dryRun,
    from_date: fromDate,
    to_date: toDate,
    mapped_rooms: byRoom.size,
    checkouts_seen: checkouts.length,
    arrivals_seen: checkins.length,
    summary,
    results,
  });
});
