-- Link the 7 Kingscliff Holiday Homes properties Brightly actually cleans to
-- their Guesty listing ids.
--
-- This column IS the allowlist for guesty-sync-reservations. The Guesty
-- account holds 46 listings; only a listing named here can ever produce a job,
-- so the other 39 are inert without any second list to maintain.
--
-- Matched on property name AND street address against the Guesty record, both
-- of which agreed for all 7. Ids are pinned literally rather than matched at
-- runtime so this migration cannot drift if a property is later renamed.

-- Snapshot first. Nothing here is destructive (every target is currently
-- NULL), but the rule on this project is that a column is never overwritten
-- without a copy of what was there.
create table if not exists guesty_listing_link_backup_20261109 (
  property_id uuid primary key,
  property_name text,
  address text,
  guesty_listing_id_before text,
  captured_at timestamptz not null default now()
);

insert into guesty_listing_link_backup_20261109 (property_id, property_name, address, guesty_listing_id_before)
select id, property_name, address, guesty_listing_id
from properties
where property_name in ('Casa Luxe','Elliston','Elysian','Magnolia','Ohana','Salty','Sea Poppy')
  and client_name = 'Kingscliff Holiday Homes'
on conflict (property_id) do nothing;

update properties p set guesty_listing_id = v.listing_id
from (values
  ('Casa Luxe', '69e093d427051200143c9f43'),
  ('Elliston',  '69e093cb7658a5001344e64c'),
  ('Elysian',   '69e093f2c352d4001436fce8'),
  ('Magnolia',  '69e093b99cf94e001430e8ae'),
  ('Ohana',     '69e093b08fa1f20016b81443'),
  ('Salty',     '69e093d49cf94e001430eb8f'),
  ('Sea Poppy', '69e093c09cf94e001430ea37')
) as v(name, listing_id)
where p.property_name = v.name
  and p.client_name = 'Kingscliff Holiday Homes'
  and p.guesty_listing_id is null;

-- One listing must never map to two properties, or a single checkout creates
-- two cleans. This project has had duplicate property rows for one address
-- before, so make the database refuse it rather than trusting the next person
-- adding a property not to paste an id twice.
create unique index if not exists properties_guesty_listing_id_unique
  on properties (guesty_listing_id)
  where guesty_listing_id is not null;
