/**
 * Import script for Lovable Cloud → owned Supabase migration.
 *
 * Reads the JSON dump produced by `supabase/functions/export-all-data`
 * and upserts it into the destination Supabase project. Preserves UUIDs
 * for auth.users so all FKs remain valid.
 *
 * Run via:
 *   npm run migrate:import -- \
 *     --dump-url <signed-url-from-export-function> \
 *     --dest-url https://ueomxjsqvmbjfufjauhe.supabase.co \
 *     --dest-service-key <service_role_key>
 *
 * Or with a local file instead of signed URL:
 *   npm run migrate:import -- --dump-file ./dump.json ...
 *
 * DRAFT STATE: the table-insertion logic is written but has NOT been
 * tested against a real dump yet. Do not run against production until
 * Day 2 when we have an actual export to iterate against.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

interface Dump {
  exported_at: string;
  source_project_url: string;
  tables: Record<string, Record<string, unknown>[]>;
  row_counts: Record<string, number>;
  auth_users: {
    id: string;
    email?: string | null;
    phone?: string | null;
    email_confirmed_at?: string | null;
    phone_confirmed_at?: string | null;
    raw_user_meta_data?: Record<string, unknown>;
    raw_app_meta_data?: Record<string, unknown>;
    created_at?: string;
    [key: string]: unknown;
  }[];
  storage: Record<string, { name: string; size: number; public_url: string | null }[]>;
  skipped_tables: string[];
  errors: { scope: string; message: string }[];
}

interface Args {
  dumpUrl?: string;
  dumpFile?: string;
  destUrl: string;
  destServiceKey: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const destUrl = get('--dest-url');
  const destServiceKey = get('--dest-service-key');
  if (!destUrl || !destServiceKey) {
    console.error('Missing required --dest-url or --dest-service-key');
    process.exit(1);
  }
  return {
    dumpUrl: get('--dump-url'),
    dumpFile: get('--dump-file'),
    destUrl,
    destServiceKey,
  };
}

async function loadDump(args: Args): Promise<Dump> {
  if (args.dumpFile) {
    const json = readFileSync(args.dumpFile, 'utf8');
    return JSON.parse(json) as Dump;
  }
  if (args.dumpUrl) {
    const res = await fetch(args.dumpUrl);
    if (!res.ok) throw new Error(`Failed to fetch dump: ${res.status}`);
    return (await res.json()) as Dump;
  }
  throw new Error('Must provide --dump-url or --dump-file');
}

/**
 * Import auth.users first, preserving their UUIDs so all public-schema
 * FKs remain valid. Uses Supabase admin.createUser with `id` field —
 * Supabase allows setting the user's UUID explicitly on creation.
 *
 * NOTE: we cannot migrate hashed passwords. Each staff/admin will need
 * to reset their password once after cutover via the normal "forgot
 * password" flow. Clients are unaffected (they use SMS magic-link).
 */
async function importAuthUsers(dest: SupabaseClient, users: Dump['auth_users']) {
  let ok = 0;
  let skipped = 0;
  const errors: { user_id: string; message: string }[] = [];
  for (const u of users) {
    if (!u.id) continue;
    // Skip if already exists (re-runnable)
    const { data: existing } = await dest.auth.admin.getUserById(u.id);
    if (existing?.user) {
      skipped += 1;
      continue;
    }
    const { error } = await dest.auth.admin.createUser({
      // @ts-expect-error admin.createUser accepts `id` at runtime even though
      // the TypeScript types omit it; required to preserve UUIDs.
      id: u.id,
      email: u.email ?? undefined,
      phone: u.phone ?? undefined,
      email_confirm: !!u.email_confirmed_at,
      phone_confirm: !!u.phone_confirmed_at,
      user_metadata: u.raw_user_meta_data,
      app_metadata: u.raw_app_meta_data,
    });
    if (error) {
      errors.push({ user_id: u.id, message: error.message });
    } else {
      ok += 1;
    }
  }
  return { ok, skipped, errors };
}

/**
 * Import public-schema table data. Inserts in table order; the export
 * function ordered tables roughly by dependency but we don't rely on
 * that — we insert in chunks and tolerate individual row conflicts via
 * upsert.
 */
async function importTable(dest: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return { inserted: 0, errors: [] };
  const errors: { row_idx: number; message: string }[] = [];
  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await dest.from(table).upsert(batch, { onConflict: 'id' });
    if (error) {
      errors.push({ row_idx: i, message: error.message });
    } else {
      inserted += batch.length;
    }
  }
  return { inserted, errors };
}

// Insertion order: parents before children. Derived from reading the
// schema. If a table's absent from this list it gets imported last in
// alphabetical order (safe default; FK errors get logged but don't
// halt the run).
const TABLE_ORDER = [
  'app_settings', 'business_settings', 'alert_tiers', 'pricing_settings', 'notification_settings',
  'sms_templates', 'google_calendar_config', 'guesty_config', 'xero_settings', 'knowledge_base',
  'profiles', 'user_roles',
  'staff_magic_tokens', 'staff_onboarding', 'staff_pay_rates', 'staff_leave',
  'cleaner_onboarding', 'cleaner_availability', 'cleaner_job_tokens',
  'properties',
  'client_properties', 'property_sop_items', 'property_restocking_items', 'property_issues',
  'leads', 'clean_requests', 'quote_requests', 'quotes',
  'client_comms', 'client_messages', 'client_tokens', 'booking_suggestions',
  'job_series', 'jobs',
  'job_acceptances', 'job_forms', 'job_photos', 'job_feedback',
  'job_checklist_completions', 'job_restocking_completions',
  'qc_audits', 'qc_audit_rooms',
  'time_entries', 'clock_events', 'time_edit_queue', 'time_edit_requests',
  'photos', 'notifications', 'sos_alerts',
  'xero_tokens',
];

async function main() {
  const args = parseArgs();
  const dump = await loadDump(args);

  console.log(`Loaded dump from ${dump.source_project_url}`);
  console.log(`Exported at: ${dump.exported_at}`);
  console.log(`Tables: ${Object.keys(dump.tables).length}, auth users: ${dump.auth_users.length}`);

  const dest = createClient(args.destUrl, args.destServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('\n── Importing auth.users ──');
  const authResult = await importAuthUsers(dest, dump.auth_users);
  console.log(`  ok=${authResult.ok} skipped=${authResult.skipped} errors=${authResult.errors.length}`);
  if (authResult.errors.length > 0) {
    console.log('  First errors:', authResult.errors.slice(0, 5));
  }

  console.log('\n── Importing tables ──');
  const orderedTables = [
    ...TABLE_ORDER.filter((t) => t in dump.tables),
    ...Object.keys(dump.tables).filter((t) => !TABLE_ORDER.includes(t)).sort(),
  ];
  const summary: { table: string; inserted: number; errors: number }[] = [];
  for (const table of orderedTables) {
    const rows = dump.tables[table];
    const { inserted, errors } = await importTable(dest, table, rows);
    summary.push({ table, inserted, errors: errors.length });
    console.log(`  ${table}: ${inserted}/${rows.length} rows${errors.length ? ` (${errors.length} errors)` : ''}`);
    if (errors.length > 0) {
      console.log(`    first error:`, errors[0]);
    }
  }

  console.log('\n── Import complete ──');
  console.log(`Total: ${summary.reduce((s, t) => s + t.inserted, 0)} rows inserted across ${summary.length} tables`);
  const failed = summary.filter((s) => s.errors > 0);
  if (failed.length > 0) {
    console.log(`Tables with errors: ${failed.map((f) => f.table).join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
