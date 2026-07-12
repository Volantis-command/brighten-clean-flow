// Public Turnover Tracker data — a Domino's-style live status for a single
// clean that the host can watch and share. Returns a MINIMAL, guest-safe
// projection (no price, no client name/phone) so it can be public without
// leaking anything, and works regardless of table RLS (service-role read).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Accept job_id from query (?job_id=) or JSON body.
  let jobId: string | null = null;
  try {
    const url = new URL(req.url);
    jobId = url.searchParams.get('job_id');
    if (!jobId && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      jobId = body.job_id ?? null;
    }
  } catch { /* ignore */ }

  if (!jobId) return json({ error: 'job_id required' }, 400);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: job, error } = await sb
    .from('jobs')
    .select('id, status, scheduled_date, scheduled_time, cleaner_1_id, property_id, arrived_at, clock_on, check_in_time, completed_at, completion_form_completed_at, properties(property_name, suburb, client_type)')
    .eq('id', jobId)
    .maybeSingle();

  if (error) return json({ error: 'lookup failed', detail: error.message }, 500);
  if (!job) return json({ error: 'not_found' }, 404);

  const property = (job as any).properties || {};

  // Cleaner — first name + rating only (no PII).
  let cleaner: { firstName: string; rating: number | null; completedJobs: number } | null = null;
  if (job.cleaner_1_id) {
    const { data: profile } = await sb.from('profiles').select('full_name, audit_scores').eq('id', job.cleaner_1_id).maybeSingle();
    const scores: number[] = (profile?.audit_scores as any) || [];
    const rating = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null;
    const { count } = await sb.from('jobs').select('id', { count: 'exact', head: true })
      .eq('cleaner_1_id', job.cleaner_1_id).eq('status', 'completed');
    cleaner = {
      firstName: (profile?.full_name || 'Your cleaner').split(' ')[0],
      rating,
      completedJobs: count || 0,
    };
  }

  // Room progress from checklist completions.
  let roomsTotal = 0, roomsDone = 0, itemsTotal = 0, itemsDone = 0;
  if (job.property_id) {
    const [{ data: items }, { data: completions }] = await Promise.all([
      sb.from('property_sop_items').select('id, room').eq('property_id', job.property_id).eq('active', true),
      sb.from('job_checklist_completions').select('sop_item_id, completed').eq('job_id', job.id),
    ]);
    const doneSet = new Set((completions || []).filter((c: any) => c.completed).map((c: any) => c.sop_item_id));
    const byRoom: Record<string, { total: number; done: number }> = {};
    for (const it of (items || []) as any[]) {
      const room = it.room || 'General';
      byRoom[room] = byRoom[room] || { total: 0, done: 0 };
      byRoom[room].total++;
      itemsTotal++;
      if (doneSet.has(it.id)) { byRoom[room].done++; itemsDone++; }
    }
    roomsTotal = Object.keys(byRoom).length;
    roomsDone = Object.values(byRoom).filter((r) => r.total > 0 && r.done >= r.total).length;
  }

  // Photo count (guest-ready proof).
  const { count: photoCount } = await sb.from('job_photos').select('id', { count: 'exact', head: true }).eq('job_id', job.id);

  const isComplete = job.status === 'completed' || !!job.completion_form_completed_at;
  const startedAt = job.clock_on || job.check_in_time || null;

  // Derive a simple stage for the stepper.
  let stage: 'scheduled' | 'enroute' | 'in_progress' | 'guest_ready' = 'scheduled';
  if (isComplete) stage = 'guest_ready';
  else if (job.status === 'in_progress' || startedAt) stage = 'in_progress';
  else if (job.arrived_at) stage = 'in_progress';
  else if (job.cleaner_1_id) stage = 'enroute';

  return json({
    ok: true,
    property: { name: property.property_name || 'Your property', suburb: property.suburb || '' },
    isAirbnb: (property.client_type || '').toLowerCase() === 'airbnb',
    status: job.status,
    stage,
    scheduled_date: job.scheduled_date,
    scheduled_time: job.scheduled_time,
    cleaner,
    timeline: { arrived_at: job.arrived_at, started_at: startedAt, completed_at: job.completed_at || job.completion_form_completed_at },
    progress: { roomsTotal, roomsDone, itemsTotal, itemsDone },
    photoCount: photoCount || 0,
    guestReady: isComplete,
    reportUrl: isComplete ? `/guest-report/${job.id}` : null,
  });
});
