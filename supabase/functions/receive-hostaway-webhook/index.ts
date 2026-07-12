// Hostaway reservation webhook → one canonical Brightly turnover.
// Reservation records are reconciled by property + checkout date so a moved,
// replaced or duplicated Hostaway reservation cannot create extra cleans.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  dateInTimeZone,
  hostawayTurnoverKey,
  isCancelledStay,
  isConfirmedStay,
  mergeExternalRefs,
  normaliseReservationStatus,
} from '../_shared/turnover-integrity.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

interface WebhookBody extends Partial<HostawayReservation> {
  object?: string;
  event?: string;
  accountId?: number | string;
  data?: HostawayReservation;
}

interface ExistingJob {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  property_id: string | null;
  source_external_refs: string[] | null;
  source_turnover_key: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method === 'GET') return json({ ok: true, function: 'receive-hostaway-webhook' });

  // Existing webhook authentication behaviour is intentionally unchanged.
  const expectedUser = Deno.env.get('HOSTAWAY_WEBHOOK_USER');
  const expectedPass = Deno.env.get('HOSTAWAY_WEBHOOK_PASS');
  if (expectedUser && expectedPass) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (!verifyBasicAuth(authHeader, expectedUser, expectedPass)) return json({ error: 'Unauthorized' }, 401);
  } else {
    console.warn('HOSTAWAY_WEBHOOK_USER / HOSTAWAY_WEBHOOK_PASS not set — accepting webhook without auth check.');
  }

  let body: WebhookBody;
  try {
    const raw = await req.text();
    if (!raw) return json({ ok: true, ping: true });
    body = JSON.parse(raw) as WebhookBody;
  } catch (error) {
    return json({ error: 'Invalid JSON body', detail: (error as Error).message }, 400);
  }

  const data: HostawayReservation = body.data ?? body as HostawayReservation;
  const event = (body.event ?? '').toLowerCase();
  if (event && !event.startsWith('reservation')) return json({ ok: true, ignored: `event ${event}` });

  const reservationId = data.id != null ? String(data.id) : null;
  const listingId = data.listingId != null ? String(data.listingId) : data.listingMapId != null ? String(data.listingMapId) : null;
  const reservationStatus = normaliseReservationStatus(data.status);
  const isCancellation = isCancelledStay(reservationStatus);

  if (!reservationId) return json({ error: 'Missing required reservation id' }, 400);
  if (!listingId && !isCancellation) return json({ error: 'Missing listingId on non-cancelled reservation', reservation_id: reservationId }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let existingJob: ExistingJob | null = null;
  const { data: reservationRows, error: reservationLookupError } = await sb
    .from('jobs')
    .select('id,status,scheduled_date,scheduled_time,property_id,source_external_refs,source_turnover_key')
    .eq('hostaway_reservation_id', reservationId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (reservationLookupError) return json({ error: 'Job lookup failed', detail: reservationLookupError.message }, 500);
  existingJob = reservationRows?.[0] as ExistingJob | undefined ?? null;

  if (!existingJob) {
    const { data: refRows, error: refLookupError } = await sb
      .from('jobs')
      .select('id,status,scheduled_date,scheduled_time,property_id,source_external_refs,source_turnover_key')
      .contains('source_external_refs', [reservationId])
      .order('created_at', { ascending: true })
      .limit(1);
    if (refLookupError) return json({ error: 'External reference lookup failed', detail: refLookupError.message }, 500);
    existingJob = refRows?.[0] as ExistingJob | undefined ?? null;
  }

  if (isCancellation) {
    if (!existingJob) return json({ ok: true, action: 'cancelled_no_job', reservation_id: reservationId });
    if (existingJob.status === 'completed') return json({ ok: true, action: 'cancellation_after_completion', job_id: existingJob.id });

    const remainingRefs = (existingJob.source_external_refs ?? []).filter((ref) => ref !== reservationId);
    if (remainingRefs.length > 0) {
      const { error } = await sb.from('jobs').update({ source_external_refs: remainingRefs, source_synced_at: new Date().toISOString() }).eq('id', existingJob.id);
      if (error) return json({ error: 'Reservation reference detach failed', detail: error.message }, 500);
      return json({ ok: true, action: 'cancelled_duplicate_reference', job_id: existingJob.id, remaining_references: remainingRefs.length });
    }

    if (existingJob.status === 'cancelled') return json({ ok: true, action: 'already_cancelled', job_id: existingJob.id });
    const { error } = await sb.from('jobs').update({ status: 'cancelled', source_synced_at: new Date().toISOString() }).eq('id', existingJob.id);
    if (error) return json({ error: 'Job cancel failed', detail: error.message }, 500);
    return json({ ok: true, action: 'cancelled', job_id: existingJob.id });
  }

  // Missing, pending, inquiry, owner-stay and blocked statuses fail closed.
  if (!isConfirmedStay(reservationStatus)) {
    if (existingJob && existingJob.status !== 'completed' && existingJob.status !== 'cancelled') {
      const { error } = await sb.from('jobs').update({ status: 'cancelled', source_synced_at: new Date().toISOString(), sync_conflict_reason: `Hostaway status '${reservationStatus || 'missing'}' does not represent a confirmed stay.` }).eq('id', existingJob.id);
      if (error) return json({ error: 'Unconfirmed job cancellation failed', detail: error.message }, 500);
      return json({ ok: true, action: 'cancelled_unconfirmed', job_id: existingJob.id, status: reservationStatus || 'missing' });
    }
    return json({ ok: true, action: 'ignored_unconfirmed', status: reservationStatus || 'missing', reservation_id: reservationId });
  }

  if (!data.departureDate) return json({ error: 'Missing departureDate on confirmed reservation', reservation_id: reservationId }, 400);

  const { data: property, error: propertyError } = await sb
    .from('properties')
    .select('id,property_name,address,client_name,checkout_time,default_price,price_includes_gst')
    .eq('hostaway_listing_id', listingId)
    .maybeSingle();
  if (propertyError) return json({ error: 'Property lookup failed', detail: propertyError.message }, 500);
  if (!property) return json({ ok: true, ignored: 'No Brightly property mapped to this Hostaway listing.', hostaway_listing_id: listingId });

  const scheduledDate = data.departureDate;
  const scheduledTime = property.checkout_time && /^\d{2}:\d{2}$/.test(property.checkout_time) ? property.checkout_time : '10:00';
  const turnoverKey = hostawayTurnoverKey(property.id, scheduledDate);
  const guestName = data.guestName?.trim() || 'Guest';
  const channel = data.channelName ?? data.source ?? 'Hostaway';
  const notes = `Hostaway turnover — ${guestName}\n${channel}${data.arrivalDate ? ` · next check-in ${data.arrivalDate}` : ''}`;

  if (!existingJob) {
    const { data: turnoverRows, error: turnoverLookupError } = await sb
      .from('jobs')
      .select('id,status,scheduled_date,scheduled_time,property_id,source_external_refs,source_turnover_key')
      .eq('source_turnover_key', turnoverKey)
      .limit(1);
    if (turnoverLookupError) return json({ error: 'Turnover lookup failed', detail: turnoverLookupError.message }, 500);
    existingJob = turnoverRows?.[0] as ExistingJob | undefined ?? null;
  }

  if (!existingJob && scheduledDate < dateInTimeZone('Australia/Brisbane')) {
    return json({ ok: true, action: 'ignored_past_checkout', reservation_id: reservationId, scheduled_date: scheduledDate });
  }

  if (existingJob) {
    if (existingJob.status === 'completed') return json({ ok: true, action: 'no_op_completed', job_id: existingJob.id });
    const refs = mergeExternalRefs(existingJob.source_external_refs, reservationId);
    const changed = existingJob.scheduled_date !== scheduledDate || existingJob.scheduled_time !== scheduledTime || existingJob.status === 'cancelled' || refs.length !== (existingJob.source_external_refs ?? []).length;
    if (!changed) return json({ ok: true, action: 'no_op_unchanged', job_id: existingJob.id });

    const { error } = await sb.from('jobs').update({
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      notes,
      status: existingJob.status === 'cancelled' ? 'pending_cleaner' : existingJob.status,
      source_turnover_key: turnoverKey,
      source_external_refs: refs,
      source_synced_at: new Date().toISOString(),
      sync_conflict_reason: null,
    }).eq('id', existingJob.id);
    if (error) return json({ error: 'Job update failed', detail: error.message }, 500);
    return json({ ok: true, action: refs.length > 1 ? 'merged_duplicate' : 'updated', job_id: existingJob.id, scheduled_date: scheduledDate });
  }

  const rawPrice = Number(property.default_price) || 0;
  const includesGst = Boolean(property.price_includes_gst);
  const priceExGst = rawPrice > 0 ? includesGst ? +(rawPrice / 1.1).toFixed(2) : +rawPrice.toFixed(2) : null;
  const priceIncGst = rawPrice > 0 ? includesGst ? +rawPrice.toFixed(2) : +(rawPrice * 1.1).toFixed(2) : null;
  const { data: newJob, error: createError } = await sb.from('jobs').insert({
    property_id: property.id,
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    status: 'pending_cleaner',
    frequency: 'one-off',
    source: 'hostaway',
    hostaway_reservation_id: reservationId,
    source_turnover_key: turnoverKey,
    source_external_refs: [reservationId],
    source_synced_at: new Date().toISOString(),
    client_name: property.client_name,
    notes,
    price_ex_gst: priceExGst,
    price_inc_gst: priceIncGst,
  }).select('id').single();
  if (createError || !newJob?.id) return json({ error: 'Job create failed', detail: createError?.message ?? 'no id returned' }, 500);
  return json({ ok: true, action: 'created', job_id: newJob.id, property_id: property.id, scheduled_date: scheduledDate });
});

function verifyBasicAuth(authHeader: string, user: string, pass: string): boolean {
  if (!authHeader.toLowerCase().startsWith('basic ')) return false;
  try {
    const [actualUser, actualPass] = atob(authHeader.slice(6).trim()).split(':');
    return actualUser === user && actualPass === pass;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
