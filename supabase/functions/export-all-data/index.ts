// Full data export for the Lovable Cloud → owned Supabase migration.
//
// What this does:
//   1. Dumps every row from all 50 public-schema tables
//   2. Dumps auth.users (preserving UUIDs so FKs survive)
//   3. Inventories all storage bucket objects (filenames + public URLs;
//      the actual bytes get copied separately during the import run)
//   4. Writes the whole export as a single JSON file into the
//      `job-photos` bucket under `_migration-exports/` (Supabase doesn't
//      let edge functions create new buckets)
//   5. Returns a signed URL valid for 1 hour so the import script (or
//      admin) can download the dump
//
// Auth: this function is public (verify_jwt = false) because we don't
// have a Supabase user to pass a JWT for during the migration window.
// Security is via a shared secret header `x-export-secret` that must
// match EXPORT_SHARED_SECRET in the function's environment. Without
// that header, every request 401s. The secret is set once in Lovable
// Cloud's function-secrets panel and never leaves there.
//
// How to invoke:
//   curl -X POST https://<project>.supabase.co/functions/v1/export-all-data \
//     -H "x-export-secret: <secret>" \
//     -H "Content-Type: application/json"
//
// Safe to re-run — each run writes a new timestamped file, nothing
// existing is mutated on Lovable Cloud. This is a READ-ONLY export.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-export-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// All 50 public-schema tables in Brightly (extracted from
// src/integrations/supabase/types.ts on 2026-04-24). Ordered roughly by
// dependency for readability; the importer disables FK checks during
// load so exact order doesn't matter for correctness.
const TABLES = [
  // Settings / config (no dependencies)
  'app_settings',
  'business_settings',
  'alert_tiers',
  'pricing_settings',
  'notification_settings',
  'sms_templates',
  'google_calendar_config',
  'guesty_config',
  'xero_settings',
  'knowledge_base',

  // Auth-adjacent
  'profiles',
  'user_roles',
  'staff_magic_tokens',
  'staff_onboarding',
  'staff_pay_rates',
  'staff_leave',
  'cleaner_onboarding',
  'cleaner_availability',
  'cleaner_job_tokens',

  // Properties + per-property config
  'properties',
  'client_properties',
  'property_sop_items',
  'property_restocking_items',
  'property_issues',

  // Clients / leads / intake
  'leads',
  'clean_requests',
  'quote_requests',
  'quotes',
  'client_comms',
  'client_messages',
  'client_tokens',
  'booking_suggestions',

  // Jobs + job lifecycle
  'job_series',
  'jobs',
  'job_acceptances',
  'job_forms',
  'job_photos',
  'job_feedback',
  'job_checklist_completions',
  'job_restocking_completions',
  'qc_audits',
  'qc_audit_rooms',

  // Time / clocking
  'time_entries',
  'clock_events',
  'time_edit_queue',
  'time_edit_requests',

  // Generic / catch-all
  'photos',
  'notifications',
  'sos_alerts',

  // External service state
  'xero_tokens',
] as const;

const STORAGE_BUCKETS = ['job-photos', 'staff-documents', 'quote-photos'] as const;

// Pagination: fetch this many rows per page to stay under memory/response limits.
const PAGE_SIZE = 1000;

interface ExportResult {
  exported_at: string;
  source_project_url: string;
  tables: Record<string, unknown[]>;
  row_counts: Record<string, number>;
  auth_users: unknown[];
  storage: Record<string, { name: string; size: number; public_url: string | null }[]>;
  skipped_tables: string[];
  errors: { scope: string; message: string }[];
}

async function dumpTable(client: SupabaseClient, table: string): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows };
}

async function dumpAuthUsers(client: SupabaseClient): Promise<{ users: unknown[]; error?: string }> {
  const users: unknown[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) return { users, error: error.message };
    const batch = data?.users ?? [];
    if (batch.length === 0) break;
    users.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    page += 1;
  }
  return { users };
}

async function inventoryBucket(
  client: SupabaseClient,
  bucket: string,
): Promise<{ items: { name: string; size: number; public_url: string | null }[]; error?: string }> {
  const items: { name: string; size: number; public_url: string | null }[] = [];
  // Recursive listing — storage.list returns immediate children, so we
  // traverse prefixes. In practice most buckets are 1-2 levels deep.
  async function walk(prefix: string) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // folder
        await walk(fullPath);
      } else {
        const { data: pub } = client.storage.from(bucket).getPublicUrl(fullPath);
        items.push({
          name: fullPath,
          size: (entry.metadata as { size?: number } | null)?.size ?? 0,
          public_url: pub?.publicUrl ?? null,
        });
      }
    }
  }
  try {
    await walk('');
    return { items };
  } catch (e) {
    return { items, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get('EXPORT_SHARED_SECRET');
  if (!expectedSecret || expectedSecret.length < 16) {
    return new Response(
      JSON.stringify({ error: 'EXPORT_SHARED_SECRET is not configured on the server.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  const providedSecret = req.headers.get('x-export-secret');
  if (providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result: ExportResult = {
    exported_at: new Date().toISOString(),
    source_project_url: supabaseUrl,
    tables: {},
    row_counts: {},
    auth_users: [],
    storage: {},
    skipped_tables: [],
    errors: [],
  };

  // 1. Dump every public table.
  for (const table of TABLES) {
    const { rows, error } = await dumpTable(client, table);
    if (error) {
      if (error.toLowerCase().includes('does not exist') || error.toLowerCase().includes('not found')) {
        result.skipped_tables.push(table);
        continue;
      }
      result.errors.push({ scope: `table:${table}`, message: error });
      continue;
    }
    result.tables[table] = rows;
    result.row_counts[table] = rows.length;
  }

  // 2. Dump auth.users (UUIDs preserved for FK integrity).
  const { users, error: authErr } = await dumpAuthUsers(client);
  if (authErr) result.errors.push({ scope: 'auth.users', message: authErr });
  result.auth_users = users;
  result.row_counts['auth.users'] = users.length;

  // 3. Inventory storage buckets.
  for (const bucket of STORAGE_BUCKETS) {
    const { items, error } = await inventoryBucket(client, bucket);
    if (error) result.errors.push({ scope: `storage:${bucket}`, message: error });
    result.storage[bucket] = items;
    result.row_counts[`storage.${bucket}`] = items.length;
  }

  // 4. Write JSON to `job-photos` bucket under `_migration-exports/`.
  const ts = result.exported_at.replace(/[:.]/g, '-');
  const filename = `_migration-exports/export-${ts}.json`;
  const json = JSON.stringify(result, null, 2);
  const bytes = new TextEncoder().encode(json);

  const { error: uploadErr } = await client.storage.from('job-photos').upload(filename, bytes, {
    contentType: 'application/json',
    cacheControl: '0',
    upsert: false,
  });
  if (uploadErr) {
    return new Response(
      JSON.stringify({
        status: 'export_completed_but_upload_failed',
        upload_error: uploadErr.message,
        row_counts: result.row_counts,
        errors: result.errors,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 5. Return a 1-hour signed URL.
  const { data: signed, error: signErr } = await client.storage
    .from('job-photos')
    .createSignedUrl(filename, 60 * 60);
  if (signErr || !signed) {
    return new Response(
      JSON.stringify({
        status: 'export_uploaded_but_signing_failed',
        file_path: `job-photos/${filename}`,
        sign_error: signErr?.message,
        row_counts: result.row_counts,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({
      status: 'ok',
      file_path: `job-photos/${filename}`,
      signed_url: signed.signedUrl,
      expires_in_seconds: 3600,
      row_counts: result.row_counts,
      skipped_tables: result.skipped_tables,
      errors: result.errors,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
