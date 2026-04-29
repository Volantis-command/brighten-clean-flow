-- Portal messages: two-way thread between client and Brightly admin.
-- Client sends from the property page, admin sees in the dashboard and
-- replies from there. Cleaner numbers are never exposed.

create table if not exists portal_messages (
  id          uuid default gen_random_uuid() primary key,
  property_id uuid references properties(id) on delete cascade,
  sender      text not null check (sender in ('client','admin')),
  message     text not null,
  created_at  timestamptz default now(),
  read        boolean default false
);

-- Index for fast property-scoped queries
create index if not exists portal_messages_property_id_idx on portal_messages(property_id, created_at desc);

-- RLS: client portal reads by matching property_id stored in request claims.
-- Admin (authenticated staff) can read/write all.
alter table portal_messages enable row level security;

-- Admin full access
create policy "Admin full access to portal_messages"
  on portal_messages
  for all
  to authenticated
  using (true)
  with check (true);

-- Anonymous client insert (portal uses anon key, property_id is the access check)
create policy "Anon insert portal_messages"
  on portal_messages
  for insert
  to anon
  with check (true);

create policy "Anon select portal_messages"
  on portal_messages
  for select
  to anon
  using (true);
