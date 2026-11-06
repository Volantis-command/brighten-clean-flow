-- 6 Nov 2026. Applied to production directly, recorded here so the repo and the
-- database agree. Re-running it is safe: every statement is guarded.
--
-- WHY
-- The Financials page could not break revenue down by Airbnb, residential or
-- deep clean, and a quarter of jobs looked unpriced. Investigation showed most
-- of that "missing" money was not missing:
--   61 jobs belong to no_charge properties and are free on purpose
--   53 had a consistent price on the same property's other jobs
--    9 needed Brendan to confirm (Villa 64 $450 ex, Roy's $181.82 ex)
--    1 had nothing to work from and was deliberately left alone
--
-- TWO SOURCES REJECTED, both would have produced wrong numbers:
--   jobs.invoice_amount averages 1.8x the job price, because the weekly batch
--     invoice covers several cleans. It is the invoice total, not this job.
--   properties.default_price is paired with price_includes_gst, which is wrong
--     on some rows (Joshua's says "includes GST" and its $350 is ex GST), so it
--     would have underpriced those by 10%.
-- Each property's own billed history was used instead. Evidence beats a flag.

-- ── What kind of clean was it ────────────────────────────────────────────────
-- The booking dialog has always had a Clean Type dropdown and has never saved
-- it: collected in the form, left out of the insert. So deep cleans have been
-- indistinguishable from turnovers in every report ever run.
alter table jobs add column if not exists service_type text;
alter table jobs add column if not exists service_type_inferred boolean not null default false;

comment on column jobs.service_type is
  'What kind of clean. Matches the booking dialog: House Clean, Deep Clean, End of Lease, Post-Build, Turnover Clean.';
comment on column jobs.service_type_inferred is
  'True where the 6 Nov 2026 backfill guessed from property type rather than a human choosing it. 484 of 489 rows are guesses, so any average over service_type must say so.';

-- Evidence first: only where the notes actually name it.
update jobs set service_type = 'Deep Clean', service_type_inferred = false
where service_type is null and status <> 'cancelled'
  and (notes ilike '%deep clean%' or price_notes ilike '%deep clean%' or completion_notes ilike '%deep clean%');

update jobs set service_type = 'End of Lease', service_type_inferred = false
where service_type is null and status <> 'cancelled'
  and (notes ilike '%end of lease%' or notes ilike '%bond clean%');

-- Then the standard clean for that kind of property, marked as a guess.
update jobs j
set service_type = case p.client_type when 'airbnb' then 'Turnover Clean' else 'House Clean' end,
    service_type_inferred = true
from properties p
where p.id = j.property_id and j.service_type is null and j.status <> 'cancelled';

update jobs set service_type = 'House Clean', service_type_inferred = true
where service_type is null and status <> 'cancelled';

-- ── Housekeeping the breakdowns depend on ───────────────────────────────────
-- frequency held both 'Monthly' and 'monthly', which splits every group-by into
-- two rows that look like different things.
update jobs set frequency = lower(frequency)
where frequency is not null and frequency <> lower(frequency);

-- Money stored to 14 decimal places never reconciles against an invoice. The
-- quote engine divides by 1.1 without rounding.
update jobs
set price_ex_gst = round(price_ex_gst::numeric, 2),
    price_inc_gst = round((price_ex_gst * 1.1)::numeric, 2)
where status <> 'cancelled' and price_ex_gst is not null
  and price_ex_gst <> round(price_ex_gst::numeric, 2);

-- The price backfill itself ran as one-off statements against production with
-- before-and-after counts, and is NOT repeated here: re-running it against a
-- database where prices have since been edited by hand would overwrite real
-- figures. The original values are kept in three snapshot tables:
--   _backfill_price_20261106      124 rows
--   _backfill_rounding_20261106     6 rows
--   _backfill_frequency_20261106    4 rows
-- Nothing was deleted and nothing was moved. Every backfilled job carries a
-- price_notes stamp saying so.
