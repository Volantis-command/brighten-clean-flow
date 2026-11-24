-- Client feedback loop (24 Nov 2026)
--
-- A client opens any clean and writes: something missed, something for the
-- next clean, or something for every clean. Each note lands on the cleaner's
-- screen for the NEXT clean at that property, the cleaner must tick it Done or
-- "Couldn't do" (with a reason), and the client sees it close.
--
-- Rules that make it carry properly:
--   * one-off notes (missed / next_clean) stay open and keep appearing on every
--     later clean until a cleaner marks them Done. "Couldn't do" carries it on.
--   * every_clean notes never close. They show on every clean until archived.
--   * a complaint about a clean never shows on that same clean, and a request
--     written on a future clean does not show on an earlier one.
--   * a finished clean is frozen: notes written after it finished never appear
--     on it, so nobody can tick a note on a job that was already over.
--
-- All access goes through SECURITY DEFINER functions below. Cleaners only see
-- jobs they are on (cleaner_1/2 or a job_acceptances row) and clients reach a
-- job by its unguessable report_token, so no RLS juggling across users.

-- ── Tables ──────────────────────────────────────────────────────────────
create table if not exists public.client_feedback_items (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties(id) on delete cascade,
  source_job_id    uuid references public.jobs(id) on delete set null,
  client_id        uuid,
  category         text not null check (category in ('missed', 'next_clean', 'every_clean')),
  room             text check (room is null or length(room) <= 40),
  message          text not null check (length(btrim(message)) between 2 and 1000),
  status           text not null default 'open' check (status in ('open', 'done', 'archived')),
  created_via      text not null default 'client' check (created_via in ('client', 'admin')),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_job_id  uuid references public.jobs(id) on delete set null,
  resolved_by      uuid,
  archived_at      timestamptz,
  archived_by      uuid
);

create index if not exists client_feedback_items_property_status_idx
  on public.client_feedback_items (property_id, status);

create table if not exists public.client_feedback_checks (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.client_feedback_items(id) on delete cascade,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  cleaner_id  uuid,
  outcome     text not null check (outcome in ('done', 'not_done')),
  note        text check (note is null or length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (item_id, job_id)
);

create index if not exists client_feedback_checks_job_idx on public.client_feedback_checks (job_id);

alter table public.client_feedback_items  enable row level security;
alter table public.client_feedback_checks enable row level security;

drop policy if exists "Admins manage client feedback" on public.client_feedback_items;
create policy "Admins manage client feedback" on public.client_feedback_items
  for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Head cleaners read client feedback" on public.client_feedback_items;
create policy "Head cleaners read client feedback" on public.client_feedback_items
  for select to authenticated
  using (has_role(auth.uid(), 'head_cleaner'::app_role));

drop policy if exists "Admins manage feedback checks" on public.client_feedback_checks;
create policy "Admins manage feedback checks" on public.client_feedback_checks
  for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Head cleaners read feedback checks" on public.client_feedback_checks;
create policy "Head cleaners read feedback checks" on public.client_feedback_checks
  for select to authenticated
  using (has_role(auth.uid(), 'head_cleaner'::app_role));

-- ── Admin alerts (same rows the NotificationBell reads) ────────────────
-- submit-portal-rating writes to a table called "alerts" that does not exist,
-- so those never reached anyone. This writes the real notifications rows,
-- honouring alert_tiers exactly like src/lib/alerts.ts createAlert().
create or replace function public.notify_admins(
  p_event_type text, p_title text, p_message text, p_link text,
  p_metadata jsonb default null, p_default_tier text default 'info'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tier text;
  v_enabled boolean;
begin
  select tier, enabled into v_tier, v_enabled
  from alert_tiers where event_type = p_event_type
  order by case tier when 'critical' then 1 when 'important' then 2 else 3 end
  limit 1;
  if v_enabled is false then return; end if;

  insert into notifications (user_id, title, message, type, tier, event_type, metadata, target_role, link, read)
  select ur.user_id, p_title, p_message, p_event_type, coalesce(v_tier, p_default_tier),
         p_event_type, p_metadata, 'admin', p_link, false
  from user_roles ur where ur.role = 'admin';
end $$;

revoke all on function public.notify_admins(text, text, text, text, jsonb, text) from public, anon, authenticated;

insert into alert_tiers (event_type, tier, enabled)
select v.event_type, v.tier, true
from (values ('client_feedback', 'important'),
             ('client_feedback_not_done', 'important'),
             ('client_feedback_repeat', 'important')) as v(event_type, tier)
where not exists (select 1 from alert_tiers a where a.event_type = v.event_type);

-- ── Who may work a job ─────────────────────────────────────────────────
create or replace function public.cff_can_work_job(p_job_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
       has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'head_cleaner'::app_role)
    or exists (select 1 from jobs j where j.id = p_job_id
               and (j.cleaner_1_id = auth.uid() or j.cleaner_2_id = auth.uid()))
    or exists (select 1 from job_acceptances a where a.job_id = p_job_id and a.cleaner_id = auth.uid())
  )
$$;

create or replace function public.cff_category_label(p_category text)
returns text language sql immutable as $$
  select case p_category
    when 'missed' then 'Missed last clean'
    when 'next_clean' then 'For the next clean'
    when 'every_clean' then 'Every clean'
    else p_category end
$$;

-- ── Cleaner: the notes for this job ────────────────────────────────────
create or replace function public.job_client_feedback(p_job_id uuid)
returns table (
  id uuid, category text, room text, message text, status text,
  created_at timestamptz, source_job_id uuid, source_job_date date,
  this_job_outcome text, this_job_note text, this_job_checked_by text,
  times_not_done int, last_not_done_note text, last_not_done_date date, last_not_done_by text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  j jobs%rowtype;
  v_done boolean;
  v_done_at timestamptz;
begin
  if not cff_can_work_job(p_job_id) then
    raise exception 'You are not on this job' using errcode = '42501';
  end if;

  select * into j from jobs where jobs.id = p_job_id;
  if not found then return; end if;
  v_done := j.status in ('completed', 'complete');
  v_done_at := coalesce(j.completion_form_completed_at, j.clock_off_at, j.clock_off);

  return query
  select i.id, i.category, i.room, i.message, i.status, i.created_at,
         i.source_job_id, sj.scheduled_date,
         c.outcome, c.note, split_part(cp.full_name, ' ', 1),
         coalesce(nd.n, 0)::int, nd.note, nd.job_date, nd.by_name
  from client_feedback_items i
  left join jobs sj on sj.id = i.source_job_id
  left join client_feedback_checks c on c.item_id = i.id and c.job_id = p_job_id
  left join profiles cp on cp.id = c.cleaner_id
  left join lateral (
    select count(*) over () as n, x.note, xj.scheduled_date as job_date,
           split_part(xp.full_name, ' ', 1) as by_name
    from client_feedback_checks x
    join jobs xj on xj.id = x.job_id
    left join profiles xp on xp.id = x.cleaner_id
    where x.item_id = i.id and x.outcome = 'not_done' and x.job_id <> p_job_id
    order by xj.scheduled_date desc, x.updated_at desc
    limit 1
  ) nd on true
  where i.property_id = j.property_id
    and i.status <> 'archived'
    -- open notes, plus anything already ticked on this job (so it stays visible as ticked)
    and (i.status = 'open' or c.id is not null)
    -- never show a complaint on the clean it is about
    and not coalesce(i.source_job_id = p_job_id and v_done, false)
    -- a request written on a later clean is for that clean, not an earlier one
    and not coalesce(sj.id <> p_job_id
             and sj.status not in ('completed', 'complete', 'cancelled')
             and sj.scheduled_date > j.scheduled_date, false)
    -- a finished clean is frozen
    and (c.id is not null or not v_done or (v_done_at is not null and i.created_at <= v_done_at))
  order by case i.category when 'missed' then 1 when 'next_clean' then 2 else 3 end, i.created_at;
end $$;

grant execute on function public.job_client_feedback(uuid) to authenticated;

-- ── Cleaner: tick a note ───────────────────────────────────────────────
create or replace function public.record_client_feedback_check(
  p_item_id uuid, p_job_id uuid, p_outcome text, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item client_feedback_items%rowtype;
  v_job jobs%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not cff_can_work_job(p_job_id) then
    raise exception 'You are not on this job' using errcode = '42501';
  end if;
  if p_outcome not in ('done', 'not_done') then
    raise exception 'Outcome must be done or not_done';
  end if;
  if p_outcome = 'not_done' and (v_note is null or length(v_note) < 3) then
    raise exception 'Say why it could not be done';
  end if;

  select * into v_item from client_feedback_items where id = p_item_id;
  select * into v_job from jobs where id = p_job_id;
  if v_item.id is null or v_job.id is null or v_item.property_id <> v_job.property_id then
    raise exception 'That note is not for this property';
  end if;
  if v_item.status = 'archived' then
    raise exception 'That note was removed by the office';
  end if;
  if v_job.status = 'cancelled' then
    raise exception 'This job is cancelled';
  end if;

  insert into client_feedback_checks (item_id, job_id, cleaner_id, outcome, note)
  values (p_item_id, p_job_id, auth.uid(), p_outcome, left(v_note, 500))
  on conflict (item_id, job_id) do update
    set outcome = excluded.outcome, note = excluded.note,
        cleaner_id = excluded.cleaner_id, updated_at = now();
end $$;

grant execute on function public.record_client_feedback_check(uuid, uuid, text, text) to authenticated;

-- ── Client: leave a note on a clean (by report link) ───────────────────
create or replace function public.submit_client_feedback(
  p_report_token text, p_category text, p_message text, p_room text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job jobs%rowtype;
  v_uid uuid := auth.uid();
  v_staff boolean := false;
  v_msg text := btrim(coalesce(p_message, ''));
  v_room text := nullif(btrim(coalesce(p_room, '')), '');
  v_client uuid;
  v_existing uuid;
  v_id uuid;
begin
  if p_report_token is null or length(p_report_token) < 8 then
    raise exception 'Invalid link';
  end if;
  select * into v_job from jobs where report_token = p_report_token;
  if v_job.id is null or v_job.property_id is null then
    raise exception 'Invalid link';
  end if;
  if v_job.status = 'cancelled' then
    raise exception 'This clean was cancelled';
  end if;

  if v_uid is not null then
    v_staff := has_role(v_uid, 'admin'::app_role) or has_role(v_uid, 'head_cleaner'::app_role);
    if not v_staff and has_role(v_uid, 'cleaner'::app_role) then
      raise exception 'Client feedback comes from the client, not the cleaner';
    end if;
  end if;

  if p_category not in ('missed', 'next_clean', 'every_clean') then
    raise exception 'Pick what kind of note this is';
  end if;
  if length(v_msg) < 2 then raise exception 'Write a short note'; end if;
  if length(v_msg) > 1000 then raise exception 'Keep it under 1000 characters'; end if;

  -- Same words on the same property while still open: keep the one note.
  select id into v_existing from client_feedback_items
  where property_id = v_job.property_id and status = 'open'
    and lower(message) = lower(v_msg)
  limit 1;
  if v_existing is not null then return v_existing; end if;

  if (select count(*) from client_feedback_items
      where source_job_id = v_job.id and created_at > now() - interval '1 day') >= 15 then
    raise exception 'That is a lot of notes for one clean. Call us instead.';
  end if;

  -- Credit the logged-in client if they own the property, else the property's client.
  if v_uid is not null and not v_staff
     and exists (select 1 from client_properties where client_id = v_uid and property_id = v_job.property_id) then
    v_client := v_uid;
  else
    select client_id into v_client from client_properties
    where property_id = v_job.property_id
    order by portal_active desc nulls last, created_at
    limit 1;
  end if;

  insert into client_feedback_items
    (property_id, source_job_id, client_id, category, room, message, created_via, created_by)
  values
    (v_job.property_id, v_job.id, v_client, p_category, left(v_room, 40), v_msg,
     case when v_staff then 'admin' else 'client' end, v_uid)
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.submit_client_feedback(text, text, text, text) to anon, authenticated;

-- ── Client: what happened to my notes ──────────────────────────────────
-- Deliberately no cleaner "couldn't do" reasons here: those go to the office.
create or replace function public.client_feedback_for_report(p_report_token text)
returns table (
  id uuid, category text, room text, message text, status text,
  created_at timestamptz, source_job_id uuid, source_job_date date,
  resolved_at timestamptz, resolved_job_date date, resolved_by text, carried boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_property uuid;
begin
  if p_report_token is null or length(p_report_token) < 8 then return; end if;
  select property_id into v_property from jobs where report_token = p_report_token;
  if v_property is null then return; end if;

  return query
  select i.id, i.category, i.room, i.message, i.status, i.created_at,
         i.source_job_id, sj.scheduled_date,
         i.resolved_at, rj.scheduled_date, split_part(rp.full_name, ' ', 1),
         exists (select 1 from client_feedback_checks x where x.item_id = i.id and x.outcome = 'not_done')
  from client_feedback_items i
  left join jobs sj on sj.id = i.source_job_id
  left join jobs rj on rj.id = i.resolved_job_id
  left join profiles rp on rp.id = i.resolved_by
  where i.property_id = v_property and i.status <> 'archived'
  order by (i.status = 'open') desc, i.created_at desc
  limit 50;
end $$;

grant execute on function public.client_feedback_for_report(text) to anon, authenticated;

-- ── Triggers: close / reopen, and tell the office ──────────────────────
create or replace function public.cff_after_check()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item client_feedback_items%rowtype;
  v_prop text;
  v_who text;
begin
  select * into v_item from client_feedback_items where id = new.item_id;

  if new.outcome = 'done' then
    update client_feedback_items
      set status = 'done', resolved_at = now(), resolved_job_id = new.job_id,
          resolved_by = new.cleaner_id, updated_at = now()
    where id = new.item_id and category in ('missed', 'next_clean') and status = 'open';
  else
    -- Flipped from Done to Couldn't do on the same job: reopen so it carries.
    update client_feedback_items
      set status = 'open', resolved_at = null, resolved_job_id = null,
          resolved_by = null, updated_at = now()
    where id = new.item_id and status = 'done' and resolved_job_id = new.job_id;

    if tg_op = 'INSERT' or old.outcome is distinct from new.outcome or old.note is distinct from new.note then
      select property_name into v_prop from properties where id = v_item.property_id;
      select split_part(full_name, ' ', 1) into v_who from profiles where id = new.cleaner_id;
      perform notify_admins(
        'client_feedback_not_done',
        'Client note not done: ' || coalesce(v_prop, 'property'),
        coalesce(v_who, 'Cleaner') || ' could not do "' || left(v_item.message, 80) || '". Reason: '
          || coalesce(new.note, '-') || '. It carries to the next clean.',
        '/properties/' || v_item.property_id || '?tab=feedback',
        jsonb_build_object('item_id', v_item.id, 'job_id', new.job_id),
        'important');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cff_after_check on public.client_feedback_checks;
create trigger trg_cff_after_check
  after insert or update of outcome, note on public.client_feedback_checks
  for each row execute function public.cff_after_check();

create or replace function public.cff_after_item_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prop text;
  v_repeat int;
begin
  if new.created_via = 'admin' then return new; end if;
  select property_name into v_prop from properties where id = new.property_id;

  perform notify_admins(
    'client_feedback',
    'Client feedback: ' || coalesce(v_prop, 'property'),
    cff_category_label(new.category) || coalesce(' (' || new.room || ')', '') || ': ' || left(new.message, 140),
    '/properties/' || new.property_id || '?tab=feedback',
    jsonb_build_object('item_id', new.id, 'job_id', new.source_job_id, 'category', new.category),
    case when new.category = 'missed' then 'important' else 'info' end);

  -- Same room missed again inside 60 days: it is a pattern, not a slip.
  if new.category = 'missed' and new.room is not null then
    select count(*) into v_repeat from client_feedback_items
    where property_id = new.property_id and category = 'missed'
      and lower(room) = lower(new.room) and created_at > now() - interval '60 days';
    if v_repeat >= 2 then
      perform notify_admins(
        'client_feedback_repeat',
        'Repeat miss: ' || new.room || ' at ' || coalesce(v_prop, 'property'),
        new.room || ' has been reported missed ' || v_repeat || ' times in 60 days. Worth making it an every-clean note or a checklist item.',
        '/properties/' || new.property_id || '?tab=feedback',
        jsonb_build_object('item_id', new.id, 'room', new.room, 'count', v_repeat),
        'important');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_cff_after_item_insert on public.client_feedback_items;
create trigger trg_cff_after_item_insert
  after insert on public.client_feedback_items
  for each row execute function public.cff_after_item_insert();

-- Trigger functions are not for calling directly.
revoke all on function public.cff_after_check() from public, anon, authenticated;
revoke all on function public.cff_after_item_insert() from public, anon, authenticated;

-- Postgres grants EXECUTE to PUBLIC by default. The cleaner functions refuse
-- a caller with no login anyway, but anon has no business calling them.
revoke all on function public.job_client_feedback(uuid) from public, anon;
revoke all on function public.record_client_feedback_check(uuid, uuid, text, text) from public, anon;
revoke all on function public.cff_can_work_job(uuid) from public, anon;
grant execute on function public.job_client_feedback(uuid) to authenticated;
grant execute on function public.record_client_feedback_check(uuid, uuid, text, text) to authenticated;
grant execute on function public.cff_can_work_job(uuid) to authenticated;
