// Read-only duplicate-jobs report. Surfaces the duplicate cleans that the sync
// bugs created so an admin can review BEFORE any cleanup runs. This function
// NEVER writes or deletes anything — it only reports.
//
// Admin-gated: the caller must present a valid admin JWT (Authorization header).
// This is the auth pattern the rest of the functions should adopt (see the
// Phase 3 security work).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ACTIVE_JOB_STATUSES = ['pending_cleaner', 'awaiting_cleaner', 'scheduled', 'confirmed', 'in_progress'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Server missing Supabase env' }, 500);
  }

  // ── Admin auth: verify the caller's JWT and that they hold the admin role ──
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Unauthorized — admin sign-in required' }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized — invalid session' }, 401);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleRow) return json({ error: 'Forbidden — admin only' }, 403);

  // ── Gather active jobs (bounded to a sensible window) ──
  const today = new Date();
  const fromStr = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);

  const { data: jobs, error: jobsErr } = await admin
    .from('jobs')
    .select('id, property_id, client_name, scheduled_date, scheduled_time, status, hostaway_reservation_id, linked_quote_id, series_id, source, created_at')
    .gte('scheduled_date', fromStr)
    .in('status', ACTIVE_JOB_STATUSES)
    .order('created_at', { ascending: true });

  if (jobsErr) return json({ error: 'Job query failed', detail: jobsErr.message }, 500);

  const rows = jobs ?? [];

  // Group helper — returns only groups with more than one member.
  function dupeGroups(keyFn: (j: any) => string | null) {
    const map = new Map<string, any[]>();
    for (const j of rows) {
      const k = keyFn(j);
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(j);
      map.set(k, arr);
    }
    return [...map.entries()]
      .filter(([, v]) => v.length > 1)
      .map(([key, v]) => ({ key, count: v.length, jobs: v }));
  }

  const byReservation = dupeGroups((j) => j.hostaway_reservation_id ? `res:${j.hostaway_reservation_id}` : null);
  const byPropertyDate = dupeGroups((j) => j.property_id && j.scheduled_date ? `${j.property_id}|${j.scheduled_date}` : null);
  const byQuoteParent = dupeGroups((j) => (j.linked_quote_id && !j.series_id) ? `quote:${j.linked_quote_id}` : null);

  // Duplicate pending booking suggestions
  const { data: sugs } = await admin
    .from('booking_suggestions')
    .select('id, property_id, external_ref, source, checkout_date, suggested_clean_date, status, created_at')
    .eq('status', 'pending')
    .gte('checkout_date', fromStr);

  const sugMap = new Map<string, any[]>();
  for (const s of (sugs ?? [])) {
    if (!s.external_ref) continue;
    const k = `${s.property_id}|${s.external_ref}`;
    const arr = sugMap.get(k) ?? [];
    arr.push(s);
    sugMap.set(k, arr);
  }
  const duplicateSuggestions = [...sugMap.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({ key, count: v.length, suggestions: v }));

  return json({
    generated_at: new Date().toISOString(),
    window_from: fromStr,
    summary: {
      duplicate_reservation_groups: byReservation.length,
      duplicate_property_date_groups: byPropertyDate.length,
      duplicate_quote_parent_groups: byQuoteParent.length,
      duplicate_pending_suggestion_groups: duplicateSuggestions.length,
    },
    duplicates_by_reservation: byReservation,
    duplicates_by_property_and_date: byPropertyDate,
    duplicates_by_quote: byQuoteParent,
    duplicate_pending_suggestions: duplicateSuggestions,
    note: 'Read-only report. No rows were changed. Review, then apply the sync-integrity migration to soft-cancel duplicates (nothing is deleted).',
  });
});
