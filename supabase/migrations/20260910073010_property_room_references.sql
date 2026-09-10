-- ============================================================================
-- Airbnb room reference library
--
-- Admin or head cleaner photographs every room at onboarding so a cleaner can
-- see exactly how each room should be left (bed styling, pillows, throws,
-- towels, lounge layout). Cleaners view it during the clean and confirm
-- against it at the end, room by room.
--
-- AIRBNB ONLY. Rooms are only ever created for client_type = 'airbnb'.
--
-- Rooms are keyed by area_id, which deliberately matches the ids the guided
-- completion flow builds in src/lib/cleanChecklist.ts (kitchen, living,
-- bathroom_N, bedroom_N, laundry, outdoor, final). That shared key is what
-- lets a reference photo appear on the right step of the end-of-clean form.
--
-- Applied to production (ueomxjsqvmbjfufjauhe) via the Supabase MCP on
-- 10 Sep 2026; this file matches the recorded version so the repo and the
-- remote migration history agree.
-- ============================================================================

create table if not exists public.property_rooms (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  area_id     text not null,
  room_type   text not null
              check (room_type in ('kitchen','living','bathroom','bedroom','laundry','outdoor','final')),
  room_index  int  not null default 1,
  -- Optional rename, e.g. "Master Bedroom". Null means use the standard title.
  -- Never overwritten by a resync.
  label       text,
  -- Set once on creation. Never overwritten by a resync, so a manual reorder sticks.
  sort_order  int  not null default 0,
  -- False when the property no longer has this room (e.g. 3 bed became 2).
  -- Rooms and their photos are parked, never deleted, so nothing is lost if
  -- the count was wrong or the room comes back.
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (property_id, area_id)
);
create index if not exists property_rooms_property_idx on public.property_rooms(property_id);

create table if not exists public.property_room_photos (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.property_rooms(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  storage_path text not null,
  public_url   text not null,
  caption      text,
  sort_order   int  not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists property_room_photos_room_idx on public.property_room_photos(room_id);
create index if not exists property_room_photos_property_idx on public.property_room_photos(property_id);

-- One row per room per job: the cleaner saw the reference and confirmed the
-- room matches before taking their final photo.
create table if not exists public.job_room_reference_checks (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  area_id             text not null,
  user_id             uuid references auth.users(id) on delete set null,
  reference_photo_ids uuid[] not null default '{}',
  confirmed_at        timestamptz not null default now(),
  unique (job_id, area_id)
);
create index if not exists job_room_reference_checks_job_idx on public.job_room_reference_checks(job_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.property_rooms            enable row level security;
alter table public.property_room_photos      enable row level security;
alter table public.job_room_reference_checks enable row level security;

-- Cleaners must be able to read the reference on site.
create policy "Authenticated read property_rooms"
  on public.property_rooms for select to authenticated using (true);
create policy "Admin or head cleaner manage property_rooms"
  on public.property_rooms for all to authenticated
  using      (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'head_cleaner'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'head_cleaner'::app_role));

create policy "Authenticated read property_room_photos"
  on public.property_room_photos for select to authenticated using (true);
create policy "Admin or head cleaner manage property_room_photos"
  on public.property_room_photos for all to authenticated
  using      (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'head_cleaner'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'head_cleaner'::app_role));

create policy "Authenticated read job_room_reference_checks"
  on public.job_room_reference_checks for select to authenticated using (true);
create policy "Cleaner records own reference check"
  on public.job_room_reference_checks for insert to authenticated
  with check (user_id = auth.uid());
create policy "Cleaner or staff update reference check"
  on public.job_room_reference_checks for update to authenticated
  using      (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'head_cleaner'::app_role))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'head_cleaner'::app_role));

-- ── The room plan: what rooms this property SHOULD have ─────────────────────
-- Single source for both the insert and the park step below, so the two can
-- never disagree. Mirrors buildChecklist() order. Returns nothing for any
-- property that is not Airbnb.
create or replace function public.property_room_plan(p_property_id uuid)
returns table(area_id text, room_type text, room_index int, sort_order int)
language sql stable security definer set search_path = public as $$
  with p as (
    select greatest(1, coalesce(bedrooms, 1))  as beds,
           greatest(1, coalesce(bathrooms, 1)) as baths,
           (coalesce(has_outdoor_area, false) or coalesce(balconies, 0) > 0 or coalesce(has_pool, false)) as has_out
      from public.properties
     where id = p_property_id and client_type = 'airbnb'
  )
  select 'kitchen', 'kitchen', 1, 10  from p
  union all select 'living', 'living', 1, 20 from p
  union all select 'bathroom_' || g, 'bathroom', g, 100 + g from p, generate_series(1, p.baths) g
  union all select 'bedroom_'  || g, 'bedroom',  g, 200 + g from p, generate_series(1, p.beds)  g
  union all select 'laundry', 'laundry', 1, 300 from p
  union all select 'outdoor', 'outdoor', 1, 400 from p where p.has_out
  union all select 'final',   'final',   1, 900 from p
$$;

-- ── Reconcile a property's rooms with its plan ──────────────────────────────
-- Adds missing rooms, reactivates returning ones, parks rooms that no longer
-- exist. Never deletes, never touches label or sort_order. Idempotent.
create or replace function public.sync_property_rooms(p_property_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.property_rooms (property_id, area_id, room_type, room_index, sort_order, active)
  select p_property_id, plan.area_id, plan.room_type, plan.room_index, plan.sort_order, true
    from public.property_room_plan(p_property_id) plan
  on conflict (property_id, area_id) do update
     set active     = true,
         room_type  = excluded.room_type,
         room_index = excluded.room_index,
         updated_at = now();

  update public.property_rooms r
     set active = false, updated_at = now()
   where r.property_id = p_property_id
     and r.active
     and not exists (
       select 1 from public.property_room_plan(p_property_id) plan where plan.area_id = r.area_id
     );
end $$;

revoke all on function public.property_room_plan(uuid)  from public;
revoke all on function public.sync_property_rooms(uuid) from public;
grant execute on function public.property_room_plan(uuid)  to authenticated;
grant execute on function public.sync_property_rooms(uuid) to authenticated;

-- ── Keep rooms in step with the property automatically ──────────────────────
-- Fires on any path that changes room counts: the edit dialog, onboarding,
-- Hostaway sync. Wrapped so a room library problem can NEVER block saving a
-- property or break a sync.
create or replace function public.trg_sync_property_rooms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.sync_property_rooms(new.id);
  exception when others then
    raise warning 'sync_property_rooms failed for property %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists property_rooms_sync on public.properties;
create trigger property_rooms_sync
  after insert or update of bedrooms, bathrooms, client_type, has_outdoor_area, balconies, has_pool
  on public.properties
  for each row execute function public.trg_sync_property_rooms();

-- ── Backfill every existing Airbnb property ─────────────────────────────────
select public.sync_property_rooms(id) from public.properties where client_type = 'airbnb';
