/**
 * Import script for Lovable Cloud → owned Supabase migration.
 *
 * Uses direct DB connection (pg) for data inserts — this bypasses
 * PostgREST's schema cache (which can lag behind the actual schema
 * after a batch migration push) and lets us use
 * `session_replication_role = replica` to defer FK checks during bulk
 * import.
 *
 * Uses Supabase admin API only for auth.users — that's the one table
 * you can't INSERT into directly with pg because Supabase wraps it in
 * its own auth server.
 *
 * Run via:
 *   npm run migrate:import -- \
 *     --dump-file migration-work/dumps/lovable-cloud-dump.json \
 *     --db-url "postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres" \
 *     --dest-url https://xxx.supabase.co \
 *     --dest-service-key sb_secret_xxx
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { readFileSync } from 'node:fs';

interface Dump {
  exported_at: string;
  source_project_url: string;
  tables: Record<string, Record<string, unknown>[]>;
  row_counts: Record<string, number>;
  auth_users: unknown[];
  storage: Record<string, unknown[]>;
  errors: unknown[];
}

interface Args {
  dumpFile: string;
  dbUrl: string;
  destUrl: string;
  destServiceKey: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dumpFile = get('--dump-file');
  const dbUrl = get('--db-url');
  const destUrl = get('--dest-url');
  const destServiceKey = get('--dest-service-key');
  if (!dumpFile || !dbUrl || !destUrl || !destServiceKey) {
    console.error('Missing required flag — need --dump-file --db-url --dest-url --dest-service-key');
    process.exit(1);
  }
  return { dumpFile, dbUrl, destUrl, destServiceKey };
}

// Insertion order (parents before children) based on FK dependencies in
// the schema. Delete runs in reverse.
const TABLE_ORDER = [
  // Settings / config (no FKs to user data)
  'app_settings', 'business_settings', 'alert_tiers', 'pricing_settings',
  'notification_settings', 'sms_templates', 'google_calendar_config',
  'guesty_config', 'xero_settings', 'knowledge_base',

  // User-adjacent (FK to auth.users)
  'profiles', 'user_roles',
  'staff_magic_tokens', 'staff_onboarding', 'staff_pay_rates', 'staff_leave',
  'cleaner_onboarding', 'cleaner_availability', 'cleaner_job_tokens',

  // Properties + per-property config
  'properties',
  'client_properties', 'property_sop_items', 'property_restocking_items', 'property_issues',

  // Leads / quotes
  'leads', 'clean_requests', 'quote_requests', 'quotes',
  'client_comms', 'client_messages', 'client_tokens', 'booking_suggestions',

  // Jobs + lifecycle
  'job_series', 'jobs',
  'job_acceptances', 'job_forms', 'job_photos', 'job_feedback',
  'job_checklist_completions', 'job_restocking_completions',
  'qc_audits', 'qc_audit_rooms',

  // Time / clocking
  'time_entries', 'clock_events', 'time_edit_queue', 'time_edit_requests',

  // Misc
  'photos', 'notifications', 'sos_alerts',

  // External
  'xero_tokens',
];

function auToE164(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return undefined;
  // Already international
  if (phone.startsWith('+')) return phone;
  // AU mobile/landline starting with 04 / 0X → +614XX / +61X
  if (digits.startsWith('0')) return '+61' + digits.substring(1);
  // Otherwise prepend + and hope for the best
  return '+' + digits;
}

async function importAuthUsers(
  sb: SupabaseClient,
  profiles: Array<{ id: string; email?: string | null; phone?: string | null; full_name?: string | null }>,
) {
  let ok = 0;
  let skipped = 0;
  const errors: { user_id: string; message: string }[] = [];
  for (const p of profiles) {
    if (!p.id) continue;
    // Skip if already exists — makes re-runnable
    const { data: existing } = await sb.auth.admin.getUserById(p.id);
    if (existing?.user) {
      skipped += 1;
      continue;
    }
    const e164Phone = auToE164(p.phone);
    const createPayload: Record<string, unknown> = {
      id: p.id,
      email_confirm: !!p.email,
      phone_confirm: !!e164Phone,
      user_metadata: p.full_name ? { full_name: p.full_name } : {},
    };
    if (p.email) createPayload.email = p.email;
    if (e164Phone) createPayload.phone = e164Phone;
    // Must have at least one of email/phone
    if (!p.email && !e164Phone) {
      errors.push({ user_id: p.id, message: 'no email or phone' });
      continue;
    }
    // @ts-expect-error admin.createUser accepts `id` at runtime
    const { error } = await sb.auth.admin.createUser(createPayload);
    if (error) {
      errors.push({ user_id: p.id, message: error.message });
    } else {
      ok += 1;
    }
  }
  return { ok, skipped, errors };
}

type ColumnMeta = { data_type: string; udt_name: string };

async function getTableColumns(pool: pg.Client, table: string): Promise<Map<string, ColumnMeta>> {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const map = new Map<string, ColumnMeta>();
  for (const r of rows) map.set(r.column_name, { data_type: r.data_type, udt_name: r.udt_name });
  return map;
}

function filterRow(row: Record<string, unknown>, columns: Map<string, ColumnMeta>): { filtered: Record<string, unknown>; stripped: string[] } {
  const filtered: Record<string, unknown> = {};
  const stripped: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (columns.has(k)) {
      const meta = columns.get(k)!;
      filtered[k] = coerceValueForColumn(v, meta);
    } else {
      stripped.push(k);
    }
  }
  return { filtered, stripped };
}

/**
 * Coerce a JS value from the dump to what pg expects for the column's
 * data type. The only tricky cases:
 *   - jsonb / json columns need the value JSON.stringified, because pg's
 *     default parameter binding treats JS arrays as Postgres arrays.
 *   - Regular Postgres arrays (e.g. TEXT[]) take a JS array directly.
 */
function coerceValueForColumn(value: unknown, meta: ColumnMeta): unknown {
  if (value === null || value === undefined) return value;
  const dt = meta.data_type.toLowerCase();
  if (dt === 'jsonb' || dt === 'json') {
    // Objects and arrays must be stringified; pg won't auto-JSON them
    // through a $n parameter.
    if (typeof value === 'object') return JSON.stringify(value);
    // Already a string — pass through (assume it's pre-serialized JSON)
    return value;
  }
  return value;
}

async function importTable(pool: pg.Client, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return { inserted: 0, strippedColumns: new Set<string>(), errors: [] };
  const columns = await getTableColumns(pool, table);
  if (columns.size === 0) {
    return { inserted: 0, strippedColumns: new Set<string>(), errors: [{ row_idx: 0, message: 'table does not exist in destination' }] };
  }

  const strippedColumns = new Set<string>();
  const errors: { row_idx: number; message: string }[] = [];
  let inserted = 0;

  // Delete existing rows (to overwrite any migration-seeded data cleanly)
  await pool.query(`DELETE FROM public.${quoteIdent(table)}`);

  for (let i = 0; i < rows.length; i++) {
    const { filtered, stripped } = filterRow(rows[i], columns);
    for (const s of stripped) strippedColumns.add(s);
    const cols = Object.keys(filtered);
    if (cols.length === 0) {
      errors.push({ row_idx: i, message: 'row has no valid columns after filtering' });
      continue;
    }
    const vals = cols.map((c) => filtered[c]);
    const placeholders = cols.map((_, j) => `$${j + 1}`).join(', ');
    const colList = cols.map((c) => quoteIdent(c)).join(', ');
    try {
      await pool.query(
        `INSERT INTO public.${quoteIdent(table)} (${colList}) VALUES (${placeholders})`,
        vals,
      );
      inserted += 1;
    } catch (e) {
      errors.push({ row_idx: i, message: (e as Error).message });
    }
  }

  return { inserted, strippedColumns, errors };
}

function quoteIdent(name: string): string {
  // Very light quoting — column and table names from our own schema
  // are known to be lowercase alphanumeric + underscore, no injection risk
  if (/^[a-z_][a-z0-9_]*$/i.test(name)) return `"${name}"`;
  throw new Error(`Unsafe identifier: ${name}`);
}

async function main() {
  const args = parseArgs();
  const dump = JSON.parse(readFileSync(args.dumpFile, 'utf8')) as Dump;

  console.log(`Loaded dump from ${dump.source_project_url}`);
  console.log(`Exported: ${dump.exported_at}`);
  console.log(`Tables: ${Object.keys(dump.tables).length}, profiles: ${dump.tables.profiles?.length ?? 0}`);

  // 1. Auth users (from profiles since Lovable's auth export failed)
  const sb = createClient(args.destUrl, args.destServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log('\n── Creating auth.users from profiles ──');
  const profiles = (dump.tables.profiles || []) as Array<{ id: string; email?: string | null; phone?: string | null; full_name?: string | null }>;
  const authResult = await importAuthUsers(sb, profiles);
  console.log(`  ok=${authResult.ok}  skipped=${authResult.skipped}  errors=${authResult.errors.length}`);
  if (authResult.errors.length > 0) {
    console.log(`  first errors:`, authResult.errors.slice(0, 5));
  }

  // 2. Connect via pg for direct table inserts
  const pool = new pg.Client({ connectionString: args.dbUrl });
  await pool.connect();

  // Defer FK checks during bulk import
  await pool.query(`SET session_replication_role = 'replica'`);

  // Order tables: known order first, then any we missed at the end
  const orderedTables = [
    ...TABLE_ORDER.filter((t) => t in dump.tables),
    ...Object.keys(dump.tables).filter((t) => !TABLE_ORDER.includes(t)).sort(),
  ];

  const summary: { table: string; inserted: number; source: number; errors: number }[] = [];
  const allStripped: Record<string, string[]> = {};

  console.log('\n── Importing tables ──');
  for (const table of orderedTables) {
    const rows = dump.tables[table];
    const { inserted, strippedColumns, errors } = await importTable(pool, table, rows);
    summary.push({ table, inserted, source: rows.length, errors: errors.length });
    if (strippedColumns.size > 0) allStripped[table] = [...strippedColumns];
    const errTag = errors.length ? ` (${errors.length} errors)` : '';
    const stripTag = strippedColumns.size > 0 ? ` [stripped: ${[...strippedColumns].join(', ')}]` : '';
    console.log(`  ${table}: ${inserted}/${rows.length} rows${errTag}${stripTag}`);
    if (errors.length > 0 && errors[0]) {
      console.log(`    first error: ${errors[0].message}`);
    }
  }

  // Re-enable FK checks
  await pool.query(`SET session_replication_role = 'origin'`);
  await pool.end();

  console.log('\n── Import complete ──');
  console.log(`Total rows inserted: ${summary.reduce((s, t) => s + t.inserted, 0)}`);

  // Columns that got stripped (reveal schema drift for a post-migration fix)
  if (Object.keys(allStripped).length > 0) {
    console.log('\n── Schema drift (columns in dump but not in destination) ──');
    console.log('These columns exist in your Lovable Cloud DB but not in the new Supabase.');
    console.log('They were silently dropped. Review and add columns manually if any matter:');
    for (const [table, cols] of Object.entries(allStripped)) {
      console.log(`  ${table}: ${cols.join(', ')}`);
    }
  }

  // Tables with errors
  const failed = summary.filter((s) => s.errors > 0);
  if (failed.length > 0) {
    console.log('\n── Tables with errors ──');
    for (const f of failed) {
      console.log(`  ${f.table}: ${f.errors} errors out of ${f.source} rows`);
    }
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
