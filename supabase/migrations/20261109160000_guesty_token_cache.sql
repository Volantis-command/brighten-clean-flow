-- Cache for the Guesty open-api bearer token.
--
-- Guesty allows only FIVE token mints per day. That number is not in the
-- docs anywhere obvious; it arrives on the 429 as `x-ratelimit-limit-day: 5`
-- with a reset about 16 hours out. Each minted token is then good for 24h.
--
-- Minting one per invocation therefore puts the integration five calls from
-- being dead until the next day, and a dry run plus a real run spends two of
-- them. This table is what keeps the sync alive, not a performance tweak.
--
-- Follows the existing xero_tokens / hostaway_tokens convention.

create table if not exists guesty_tokens (
  id text primary key default 'default',
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- A bearer token is a credential. RLS on with no policies at all means only
-- the service role (the edge function) can read it; anon and authenticated
-- get nothing, including through PostgREST.
alter table guesty_tokens enable row level security;
revoke all on guesty_tokens from anon, authenticated;

comment on table guesty_tokens is
  'Cached Guesty open-api bearer token. Guesty permits 5 token mints per day; each token lives 24h. Service role only.';
