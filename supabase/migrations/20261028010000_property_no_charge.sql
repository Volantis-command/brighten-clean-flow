-- ============================================================================
-- No-charge properties (BJ, 28 Oct 2026): "Rumble and Humble abode is me, mine,
-- so they are ok to be free."
--
-- Real work with no invoice behind it. These must never be flagged as a missing
-- price, never wait to be closed off, and never drag the dollars-per-hour down.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP; this file
-- matches the recorded version so the repo and remote history agree.
-- ============================================================================

alter table public.properties
  add column if not exists no_charge boolean not null default false;

update public.properties
   set no_charge = true
 where property_name in ('Rumble', 'Humble Abode');

update public.jobs j
   set closed_off_at = coalesce(j.closed_off_at, j.created_at, now()),
       closed_off_reason = coalesce(j.closed_off_reason, 'no_invoice_needed')
  from public.properties p
 where p.id = j.property_id
   and p.no_charge
   and j.status = 'completed'
   and j.closed_off_at is null;
