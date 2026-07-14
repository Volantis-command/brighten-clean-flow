// Hostaway reservation backfill — pulls reservations from a connected
// client's Hostaway account within a date range and creates/updates
// turnover jobs the same way the webhook receiver does. This is the
// safety net for:
//   - reservations that existed before the webhook was configured
//   - any webhook deliveries Hostaway dropped (rare but possible)
//   - just-onboarded clients who want to see their next 30+ days of
//     turnovers immediately, without waiting for guests to check out
//
// Runs the same per-reservation logic as receive-hostaway-webhook so the
// outcome is identical: jobs are deduped on hostaway_reservation_id,
// created in 'pending_cleaner', cancelled if Hostaway says cancelled.
//
// Defaults to today-30 → today+60 days (covers recent-past missed
// turnovers + the typical Hostaway booking window). Caller can override
// via body params.
//
// Hostaway pagination: this v1 fetches a single page with limit=500. The
// 19-property target client at ~5 turnovers/week × 90 days = ~245
// reservations, well within one page. Add cursor pagination (afterId)
// when first 500+ client onboards.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  client_id: string;        // Brightly client_id (profiles.id)
  from_date?: string;       // YYYY-MM-DD, default today - 30
  to_date?: string;         // YYYY-MM-DD, default today + 60
}

interface HostawayReservation {
  id: number | string;
  listingId?: number | string;
  listingMapId?: number | string;
  arrivalDate?: string;
  departureDate?: string;
  guestName?: string;
  status?: string;
  channelName?: string;
  source?: string;
}

interface ReservationResult {
  reservation_id: string;
  listing_id: string | null;
  departure_date: string | null;
  guest_name: string;
  status:
    | 'created'
    | 'updated'
    | 'cancelled'
    | 'no_op_unchanged'
    | 'no_op_completed'
    | 'no_property'
    | 'skipped_out_of_range'
    | 'skipped_no_departure'
    | 'skipped_unconfirmed'
    | 'error';
  job_id: string | null;
  error?: string;
}

const CANCELLED_STATUSES = new Set([
  'cancelled', 'canceled', 'denied', 'declined', 'expired',
]);

// Only confirmed guest stays generate turnover cleans. Inquiries / pending /
// awaiting-payment holds must NOT create jobs. Empty status → treat as
// confirmed (Hostaway sends a status on real bookings; absence = fall back to
// creating rather than dropping a genuine clean).
const CONFIRMED_STATUSES = new Set(['new', 'modified', 'confirmed']);
function isConfirmedStay(status: string): boolean {
  return status === '' || CONFIRMED_STATUSES.has(status);
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.client_id) {
    return json({ error: 'Missing required field: client_id' }, 400);
  }

  const fromDate = body.from_date && /^\d{4}-\d{2}-\d{2}$/.test(body.from_date)
    ? body.from_date
    : todayPlusDays(-30);
  const toDate = body.to_date && /^\d{4}-\d{2}-\d{2}$/.test(body.to_date)
    ? body.to_date
    : todayPlusDays(60);

  if (fromDate > toDate) {
    return json({ error: 'from_date must be on or before to_date' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Get the access token for this client
  const { data: tokenRow, error: tokenErr } = await sb
    .from('hostaway_tokens')
    .select('id, access_token')
    .eq('client_id', body.client_id)
    .maybeSingle();

  if (tokenErr) {
    return json({ error: 'Failed to load Hostaway token', detail: tokenErr.message }, 500);
  }
  if (!tokenRow?.access_token) {
    return json({ error: 'Client is not connected to Hostaway' }, 400);
  }

  // 2. Pull reservations from Hostaway
  const reservationsResp = await fetch('https://api.hostaway.com/v1/reservations?limit=500', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${tokenRow.access_token}`,
      'Cache-Control': 'no-cache',
    },
  });

  if (!reservationsResp.ok) {
    const errText = await reservationsResp.text();
    return json({
      error: 'Hostaway /reservations request failed',
      status: reservationsResp.status,
      detail: errText,
    }, 502);
  }

  const reservationsBody = await reservationsResp.json() as { status?: string; result?: HostawayReservation[]; count?: number };
  const allReservations = reservationsBody.result ?? [];

  if (!Array.isArray(allReservations)) {
    return json({ error: 'Unexpected Hostaway response shape', detail: reservationsBody }, 502);
  }

  // 3. Process each reservation that falls in [fromDate, toDate] by departureDate
  const results: ReservationResult[] = [];

  for (const reservation of allReservations) {
    const reservationId = reservation.id != null ? String(reservation.id) : '';
    const listingId = reservation.listingId != null
      ? String(reservation.listingId)
      : (reservation.listingMapId != null ? String(reservation.listingMapId) : null);
    const departureDate = reservation.departureDate ?? null;
    const guestName = reservation.guestName?.trim() || 'Guest';

    if (!reservationId) continue; // Truly broken record, skip silently

    // Skip if no departure date AND not a cancellation. Cancellations
    // with no departure date can still affect existing jobs (look up by
    // reservation_id only).
    const reservationStatus = (reservation.status ?? '').toLowerCase();
    const isCancellation = CANCELLED_STATUSES.has(reservationStatus);

    if (!departureDate && !isCancellation) {
      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: null,
        guest_name: guestName,
        status: 'skipped_no_departure',
        job_id: null,
      });
      continue;
    }

    // Filter: only act on reservations within the range (by departure
    // date). Cancellations always pass through so we can clean up
    // dropped jobs.
    if (departureDate && !isCancellation && (departureDate < fromDate || departureDate > toDate)) {
      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: departureDate,
        guest_name: guestName,
        status: 'skipped_out_of_range',
        job_id: null,
      });
      continue;
    }

    // Process — same logic as receive-hostaway-webhook.
    if (!listingId && !isCancellation) {
      results.push({
        reservation_id: reservationId,
        listing_id: null,
        departure_date: departureDate,
        guest_name: guestName,
        status: 'error',
        job_id: null,
        error: 'Missing listingId on non-cancelled reservation',
      });
      continue;
    }

    // Look up existing job by reservation id (idempotency).
    // limit(1)+array, NOT maybeSingle(): if duplicates already exist,
    // maybeSingle() throws PGRST116 which the old code swallowed and then
    // created yet another duplicate. Taking the earliest row updates it
    // instead of compounding the pile.
    const { data: existingRows, error: existErr } = await sb
      .from('jobs')
      .select('id, status, scheduled_date, scheduled_time')
      .eq('hostaway_reservation_id', reservationId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (existErr) {
      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: departureDate,
        guest_name: guestName,
        status: 'error',
        job_id: null,
        error: `Job lookup failed: ${existErr.message}`,
      });
      continue;
    }
    const existingJob = existingRows?.[0] ?? null;

    // Skip inquiries / pending / holds that aren't confirmed stays (and don't
    // already have a job to maintain).
    if (!isCancellation && !isConfirmedStay(reservationStatus) && !existingJob) {
      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: departureDate,
        guest_name: guestName,
        status: 'skipped_unconfirmed',
        job_id: null,
      });
      continue;
    }

    // Cancellation path
    if (isCancellation) {
      if (!existingJob) {
        // Cancellation for a reservation we never had a job for — no-op
        continue;
      }
      if (existingJob.status === 'cancelled') {
        results.push({
          reservation_id: reservationId,
          listing_id: listingId,
          departure_date: departureDate,
          guest_name: guestName,
          status: 'no_op_unchanged',
          job_id: existingJob.id,
        });
        continue;
      }
      if (existingJob.status === 'completed') {
        results.push({
          reservation_id: reservationId,
          listing_id: listingId,
          departure_date: departureDate,
          guest_name: guestName,
          status: 'no_op_completed',
          job_id: existingJob.id,
        });
        continue;
      }

      const { error: cancelErr } = await sb
        .from('jobs')
        .update({ status: 'cancelled' })
        .eq('id', existingJob.id);

      if (cancelErr) {
        results.push({
          reservation_id: reservationId,
          listing_id: listingId,
          departure_date: departureDate,
          guest_name: guestName,
          status: 'error',
          job_id: existingJob.id,
          error: `Cancel failed: ${cancelErr.message}`,
        });
        continue;
      }

      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: departureDate,
        guest_name: guestName,
        status: 'cancelled',
        job_id: existingJob.id,
      });
      continue;
    }

    // Look up property (need it for both create and to skip if unmapped).
    // We pull default_price + price_includes_gst here so the job is born
    // with a price — without this, xero-auto-invoice-job throws "No price
    // set on job" and the error is silently swallowed (Brendan 2026-05-08
    // fix: missed-cleans bug).
    const { data: property, error: propErr } = await sb
      .from('properties')
      .select('id, client_name, checkout_time, default_price, price_includes_gst')
      .eq('hostaway_listing_id', listingId)
      .maybeSingle();

    if (propErr && propErr.code !== 'PGRST116') {
      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: departureDate,
        guest_name: guestName,
        status: 'error',
        job_id: null,
        error: `Property lookup failed: ${propErr.message}`,
      });
      continue;
    }

    if (!property) {
      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: departureDate,
        guest_name: guestName,
        status: 'no_property',
        job_id: null,
        error: 'No Brightly property tagged with this listingId — run Sync Listings first',
      });
      continue;
    }

    const scheduledDate = departureDate!; // checked above
    const scheduledTime = property.checkout_time && /^\d{2}:\d{2}$/.test(property.checkout_time)
      ? property.checkout_time
      : '10:00';
    const channel = reservation.channelName ?? reservation.source ?? 'Hostaway';
    const notes = `Hostaway turnover — ${guestName}\n${channel}${reservation.arrivalDate ? ` · next check-in ${reservation.arrivalDate}` : ''}`;

    if (existingJob) {
      if (existingJob.status === 'completed') {
        results.push({
          reservation_id: reservationId,
          listing_id: listingId,
          departure_date: scheduledDate,
          guest_name: guestName,
          status: 'no_op_completed',
          job_id: existingJob.id,
        });
        continue;
      }

      const dateChanged = existingJob.scheduled_date !== scheduledDate;
      const timeChanged = existingJob.scheduled_time !== scheduledTime;

      if (!dateChanged && !timeChanged) {
        results.push({
          reservation_id: reservationId,
          listing_id: listingId,
          departure_date: scheduledDate,
          guest_name: guestName,
          status: 'no_op_unchanged',
          job_id: existingJob.id,
        });
        continue;
      }

      const { error: updErr } = await sb
        .from('jobs')
        .update({
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          notes,
        })
        .eq('id', existingJob.id);

      if (updErr) {
        results.push({
          reservation_id: reservationId,
          listing_id: listingId,
          departure_date: scheduledDate,
          guest_name: guestName,
          status: 'error',
          job_id: existingJob.id,
          error: `Update failed: ${updErr.message}`,
        });
        continue;
      }

      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: scheduledDate,
        guest_name: guestName,
        status: 'updated',
        job_id: existingJob.id,
      });
      continue;
    }

    // Compute price from property defaults so the auto-invoice has something
    // to bill against. AU GST: convert to ex-GST if the stored value is inc.
    const propAny: any = property;
    const rawPrice = Number(propAny.default_price) || 0;
    const includesGst = !!propAny.price_includes_gst;
    const priceExGst = rawPrice > 0
      ? (includesGst ? +(rawPrice / 1.1).toFixed(2) : +rawPrice.toFixed(2))
      : null;
    const priceIncGst = rawPrice > 0
      ? (includesGst ? +rawPrice.toFixed(2) : +(rawPrice * 1.1).toFixed(2))
      : null;

    // Create new turnover job
    const { data: newJob, error: insErr } = await sb
      .from('jobs')
      .insert({
        property_id: property.id,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        status: 'pending_cleaner',
        frequency: 'one-off',
        source: 'hostaway',
        hostaway_reservation_id: reservationId,
        client_name: property.client_name,
        guest_name: guestName,
        notes,
        price_ex_gst: priceExGst,
        price_inc_gst: priceIncGst,
      })
      .select('id')
      .single();

    if (insErr || !newJob?.id) {
      results.push({
        reservation_id: reservationId,
        listing_id: listingId,
        departure_date: scheduledDate,
        guest_name: guestName,
        status: 'error',
        job_id: null,
        error: `Job create failed: ${insErr?.message ?? 'no id returned'}`,
      });
      continue;
    }

    results.push({
      reservation_id: reservationId,
      listing_id: listingId,
      departure_date: scheduledDate,
      guest_name: guestName,
      status: 'created',
      job_id: newJob.id,
    });
  }

  // 4. Update last_synced_at on the token row
  const { error: stampErr } = await sb
    .from('hostaway_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  if (stampErr) {
    console.warn('Failed to update last_synced_at', stampErr.message);
  }

  // 5. Summary
  const summary = {
    fetched_from_hostaway: allReservations.length,
    in_range: results.filter((r) => r.status !== 'skipped_out_of_range' && r.status !== 'skipped_no_departure').length,
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
    cancelled: results.filter((r) => r.status === 'cancelled').length,
    no_op: results.filter((r) => r.status === 'no_op_unchanged' || r.status === 'no_op_completed').length,
    no_property: results.filter((r) => r.status === 'no_property').length,
    errors: results.filter((r) => r.status === 'error').length,
    range: { from_date: fromDate, to_date: toDate },
  };

  return json({
    status: 'ok',
    summary,
    results,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
