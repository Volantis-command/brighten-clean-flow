// Hostaway webhook receiver — auto-creates / updates / cancels turnover
// jobs based on reservation events from a connected client's Hostaway
// account.
//
// This is P3 of the Hostaway integration and is the actual core value:
// for a 19-property Airbnb client, every guest checkout becomes a
// turnover job with no manual data entry.
//
// Hostaway sends only TWO webhook event types (per their docs):
//   - reservation.created
//   - reservation.updated
//
// Cancellations come through as reservation.updated with
// data.status = 'cancelled' (or 'denied' for declined bookings).
// There's no separate reservation.deleted or reservation.cancelled
// event — we react to status transitions on update.
//
// Hostaway events may arrive out of order. The most important case for
// us is reservation.updated arriving before reservation.created. This
// handler treats both events the same way for the create-or-update
// path: dedupe on hostaway_reservation_id, upsert.
//
// Authentication: Hostaway uses HTTP Basic Auth on outbound webhooks
// (login + password configured per webhook in their UI). Brightly
// reads HOSTAWAY_WEBHOOK_USER + HOSTAWAY_WEBHOOK_PASS from Supabase
// secrets and verifies the Authorization header on every request. If
// either env var is unset, the function logs a warning and processes
// the request anyway — this lets staging/local testing work without
// secret config, but production should always have both set.
//
// Webhook URL Hostaway needs:
//   https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/receive-hostaway-webhook
//
// Hostaway side (one-time per client):
//   1. Settings → Public API → Webhooks → New webhook
//   2. URL: the URL above
//   3. Events: reservation.created, reservation.updated
//   4. Login: value from HOSTAWAY_WEBHOOK_USER
//   5. Password: value from HOSTAWAY_WEBHOOK_PASS
//
// We use ONE shared webhook secret across all connected clients (each
// client's reservations route to the right property via listingId →
// hostaway_listing_id, which is unique per Hostaway account).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Hostaway reservation payload — fields we care about. We accept extra
// fields and ignore them. Field names match Hostaway's documented
// reservation object (listingId, arrivalDate, departureDate, etc.).
interface HostawayReservation {
  id: number | string;
  listingId?: number | string;
  // Older Hostaway docs use listingMapId; accept both defensively
  listingMapId?: number | string;
  arrivalDate?: string;        // YYYY-MM-DD
  departureDate?: string;      // YYYY-MM-DD
  guestName?: string;
  status?: string;             // 'confirmed' | 'cancelled' | 'denied' | 'ownerStay' | ...
  channelName?: string;
  source?: string;
}

interface WebhookBody {
  // Hostaway envelope structure (per their docs / standard webhook patterns).
  // Some Hostaway accounts send the reservation directly as the body root —
  // we accept both shapes.
  object?: string;             // 'reservation'
  event?: string;              // 'reservation.created' | 'reservation.updated'
  accountId?: number | string;
  data?: HostawayReservation;
  // Fallback: reservation fields at root
  id?: number | string;
  listingId?: number | string;
  listingMapId?: number | string;
  arrivalDate?: string;
  departureDate?: string;
  guestName?: string;
  status?: string;
}

const CANCELLED_STATUSES = new Set([
  'cancelled', 'canceled', 'denied', 'declined', 'expired',
]);

// Only these statuses represent a confirmed guest stay that needs a turnover
// clean. Inquiries, pending/awaiting-payment holds and owner blocks must NOT
// create cleans (that was the "phantom cleans on days with no checkout" bug).
// An empty/missing status on a reservation event is treated as confirmed —
// Hostaway sends a status on real bookings, so absence means fall back to
// creating rather than silently dropping a genuine clean.
const CONFIRMED_STATUSES = new Set(['new', 'modified', 'confirmed']);
function isConfirmedStay(status: string): boolean {
  return status === '' || CONFIRMED_STATUSES.has(status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Health check / connectivity test for Hostaway's "test webhook" feature
  if (req.method === 'GET') {
    return json({ ok: true, function: 'receive-hostaway-webhook' });
  }

  // 1. Authenticate via HTTP Basic Auth
  const expectedUser = Deno.env.get('HOSTAWAY_WEBHOOK_USER');
  const expectedPass = Deno.env.get('HOSTAWAY_WEBHOOK_PASS');

  if (expectedUser && expectedPass) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!verifyBasicAuth(authHeader, expectedUser, expectedPass)) {
      return json({ error: 'Unauthorized' }, 401);
    }
  } else {
    console.warn(
      'HOSTAWAY_WEBHOOK_USER / HOSTAWAY_WEBHOOK_PASS not set — accepting webhook without auth check. ' +
      'Set both in Supabase secrets and configure them in Hostaway webhook settings before going live.'
    );
  }

  // 2. Parse body
  let body: WebhookBody;
  try {
    const raw = await req.text();
    if (!raw) {
      // Some webhook providers send a ping with empty body — treat as health check
      return json({ ok: true, ping: true });
    }
    body = JSON.parse(raw) as WebhookBody;
  } catch (e) {
    return json({ error: 'Invalid JSON body', detail: (e as Error).message }, 400);
  }

  // 3. Extract reservation fields (envelope or root)
  const data: HostawayReservation = body.data ?? (body as HostawayReservation);
  const event = (body.event ?? '').toLowerCase();

  // We only act on reservation events. Ignore message events etc.
  if (event && !event.startsWith('reservation')) {
    return json({ ok: true, ignored: `event ${event}` });
  }

  const reservationId = data.id != null ? String(data.id) : null;
  const listingId = data.listingId != null
    ? String(data.listingId)
    : (data.listingMapId != null ? String(data.listingMapId) : null);

  if (!reservationId || !listingId) {
    return json({
      error: 'Missing required reservation fields',
      detail: { has_reservation_id: !!reservationId, has_listing_id: !!listingId },
    }, 400);
  }

  // 4. Service-role client for DB writes
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 5. Look up the property by hostaway_listing_id.
  // We also pull default_price + price_includes_gst so the new job is born
  // with a price — without this, xero-auto-invoice-job throws "No price set
  // on job" and the failure is silently swallowed (Brendan 2026-05-08 fix).
  const { data: property, error: propErr } = await sb
    .from('properties')
    .select('id, property_name, address, client_name, checkout_time, default_cleaner_id, default_price, price_includes_gst')
    .eq('hostaway_listing_id', listingId)
    .maybeSingle();

  if (propErr) {
    return json({ error: 'Property lookup failed', detail: propErr.message }, 500);
  }

  if (!property) {
    // Unknown listing — log and 200 so Hostaway doesn't keep retrying.
    // Admin will see no jobs being created and investigate via Hostaway sync.
    console.warn(`Hostaway webhook: no property matched listingId=${listingId} (reservationId=${reservationId})`);
    return json({
      ok: true,
      ignored: 'No Brightly property tagged with this Hostaway listingId. Run "Sync listings" to import the listing.',
      hostaway_listing_id: listingId,
    });
  }

  // 6. Look up existing job by reservation id (idempotency).
  // Use limit(1)+array, NOT maybeSingle(): if duplicate jobs already exist for
  // this reservation, maybeSingle() throws PGRST116, which the old code
  // swallowed and then fell through to CREATE ANOTHER duplicate — the
  // compounding bug where every webhook/sync made the pile grow. Taking the
  // earliest existing row means we update it and never add more.
  const { data: existingRows, error: existErr } = await sb
    .from('jobs')
    .select('id, status, scheduled_date, scheduled_time, property_id')
    .eq('hostaway_reservation_id', reservationId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (existErr) {
    return json({ error: 'Job lookup failed', detail: existErr.message }, 500);
  }
  const existingJob = existingRows?.[0] ?? null;

  const reservationStatus = (data.status ?? '').toLowerCase();
  const isCancellation = CANCELLED_STATUSES.has(reservationStatus);

  // Ignore inquiries / pending / owner blocks etc. — but only when there's no
  // existing job to maintain. If a job already exists and the reservation is
  // now non-confirmed (but not an outright cancellation), fall through so the
  // update/cancel logic below can react to it.
  if (!isCancellation && !isConfirmedStay(reservationStatus) && !existingJob) {
    return json({ ok: true, action: 'ignored_unconfirmed', status: reservationStatus, reservation_id: reservationId });
  }

  // 7. Cancellation path — soft-cancel the job if it exists
  if (isCancellation) {
    if (!existingJob) {
      return json({ ok: true, action: 'cancelled_no_job', reservation_id: reservationId });
    }

    if (existingJob.status === 'cancelled') {
      return json({ ok: true, action: 'already_cancelled', job_id: existingJob.id });
    }

    if (existingJob.status === 'completed') {
      // The clean already happened — don't undo it. Just log.
      console.warn(`Hostaway cancellation arrived for reservation=${reservationId} but job=${existingJob.id} is already completed`);
      return json({ ok: true, action: 'cancellation_after_completion', job_id: existingJob.id });
    }

    const { error: cancelErr } = await sb
      .from('jobs')
      .update({ status: 'cancelled' })
      .eq('id', existingJob.id);

    if (cancelErr) {
      return json({ error: 'Job cancel failed', detail: cancelErr.message }, 500);
    }

    return json({ ok: true, action: 'cancelled', job_id: existingJob.id });
  }

  // 8. Normal create-or-update path. We need departureDate to schedule the clean.
  if (!data.departureDate) {
    return json({
      error: 'Missing departureDate on non-cancelled reservation',
      reservation_id: reservationId,
    }, 400);
  }

  const scheduledDate = data.departureDate; // YYYY-MM-DD
  const scheduledTime = property.checkout_time && /^\d{2}:\d{2}$/.test(property.checkout_time)
    ? property.checkout_time
    : '10:00';

  const guestName = data.guestName?.trim() || 'Guest';
  const channel = data.channelName ?? data.source ?? 'Hostaway';
  const notes = `Hostaway turnover — ${guestName}\n${channel}${data.arrivalDate ? ` · next check-in ${data.arrivalDate}` : ''}`;

  if (existingJob) {
    // Update existing job's date if it changed; leave everything else
    // (cleaner assignment, status, etc.) untouched. Skip if already
    // completed (don't rewrite history).
    if (existingJob.status === 'completed') {
      return json({ ok: true, action: 'no_op_completed', job_id: existingJob.id });
    }

    const dateChanged = existingJob.scheduled_date !== scheduledDate;
    const timeChanged = existingJob.scheduled_time !== scheduledTime;

    if (!dateChanged && !timeChanged) {
      return json({ ok: true, action: 'no_op_unchanged', job_id: existingJob.id });
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
      return json({ error: 'Job update failed', detail: updErr.message }, 500);
    }

    return json({
      ok: true,
      action: 'updated',
      job_id: existingJob.id,
      previous_date: existingJob.scheduled_date,
      new_date: scheduledDate,
    });
  }

  // 9. Create new turnover job
  // Mirrors the field set used by create-booking-from-quote. Status flows
  // through the BEFORE INSERT trigger (enforce_initial_job_status):
  // no cleaner assigned → 'pending_cleaner' (yellow, awaits assignment).
  //
  // Price inheritance: read property.default_price and convert to ex/inc-GST
  // pair so xero-auto-invoice-job has a price to bill against on completion.
  const propAny: any = property;
  const rawPrice = Number(propAny.default_price) || 0;
  const includesGst = !!propAny.price_includes_gst;
  const priceExGst = rawPrice > 0
    ? (includesGst ? +(rawPrice / 1.1).toFixed(2) : +rawPrice.toFixed(2))
    : null;
  const priceIncGst = rawPrice > 0
    ? (includesGst ? +rawPrice.toFixed(2) : +(rawPrice * 1.1).toFixed(2))
    : null;

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
    return json({
      error: 'Job create failed',
      detail: insErr?.message ?? 'no id returned',
    }, 500);
  }

  return json({
    ok: true,
    action: 'created',
    job_id: newJob.id,
    property_id: property.id,
    scheduled_date: scheduledDate,
  });
});

function verifyBasicAuth(authHeader: string, user: string, pass: string): boolean {
  if (!authHeader.toLowerCase().startsWith('basic ')) return false;
  const encoded = authHeader.slice(6).trim();
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const [u, p] = decoded.split(':');
  return u === user && p === pass;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
