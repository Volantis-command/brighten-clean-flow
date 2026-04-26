-- Hostaway P3 webhook idempotency key.
--
-- Hostaway delivers webhooks at-least-once and may deliver them out of
-- order. To prevent duplicate jobs from re-deliveries, the webhook
-- handler dedupes on jobs.hostaway_reservation_id (the Hostaway
-- reservation primary key, stored as text).
--
-- Indexed for fast upsert/lookup. The index is partial (only rows
-- where the column is set) to keep the index small — non-Hostaway
-- jobs leave it null.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS hostaway_reservation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_hostaway_reservation_id
  ON public.jobs(hostaway_reservation_id)
  WHERE hostaway_reservation_id IS NOT NULL;
