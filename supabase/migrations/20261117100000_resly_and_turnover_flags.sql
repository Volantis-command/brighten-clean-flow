-- Resly link + the two turnover flags, in one block.
--
-- Coastal Holiday Homes runs on Resly, not Guesty. Their cleans have been
-- hand-entered since the start, which is why 10 of 15 upcoming ones were
-- missing on 17 Nov including Reflections 1501 the next morning.

-- ---------------------------------------------------------------------------
-- 1. The allowlist, same discipline as guesty_listing_id.
--
-- A Resly room can only ever produce a job if some property carries its id
-- here. Coastal manage 8 rooms; Brightly has only ever cleaned two of them.
-- Nothing is synced for a room nobody has linked, so onboarding is one UPDATE
-- and losing a property is clearing the column. No second list to keep in step.
-- ---------------------------------------------------------------------------
alter table properties add column if not exists resly_room_id text;

-- One room must never map to two properties, or a single checkout makes two
-- cleans and two cleaners turn up. This project has had duplicate property
-- rows for one address before.
create unique index if not exists properties_resly_room_id_unique
  on properties (resly_room_id) where resly_room_id is not null;

comment on column properties.resly_room_id is
  'Resly roomId (e.g. REFLECTIONS-1501). Set = this property syncs from Resly. Null = Resly never creates work for it.';

-- ---------------------------------------------------------------------------
-- 2. Turnover flags, for the visual markers on the schedule.
--
-- back_to_back: another guest checks in the SAME DAY, so the clean has a hard
--   deadline rather than "sometime today".
-- owner_stay: the next arrival is the owner, so the clean needs to be the
--   best one. In Resly this is agentId = 'OWNER' on the next reservation.
--
-- flags_source records whether a sync worked it out or a human set it. The
-- sync must never overwrite a manual flag, or the next nightly run silently
-- undoes what an admin did on purpose.
-- ---------------------------------------------------------------------------
alter table jobs add column if not exists is_back_to_back boolean not null default false;
alter table jobs add column if not exists is_owner_stay   boolean not null default false;
alter table jobs add column if not exists flags_source    text;

alter table jobs drop constraint if exists jobs_flags_source_check;
alter table jobs add constraint jobs_flags_source_check
  check (flags_source is null or flags_source in ('auto', 'manual'));

-- The schedule filters on these, and most jobs are neither.
create index if not exists jobs_turnover_flags_idx
  on jobs (scheduled_date) where is_back_to_back or is_owner_stay;

comment on column jobs.flags_source is
  'auto = set by a PMS sync and safe to recompute. manual = set by a human; a sync must leave it alone.';
