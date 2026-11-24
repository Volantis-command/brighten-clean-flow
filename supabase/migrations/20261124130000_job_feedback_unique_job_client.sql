-- job_feedback is written with upsert(onConflict: 'job_id,client_id') by
-- submit-portal-rating and twilio-inbound-sms, but no matching constraint
-- existed, so every write failed and the table never held a row.
-- Applied to prod by hand on 24 Nov 2026 (table had 0 rows). Idempotent.
create unique index if not exists job_feedback_job_id_client_id_key
  on public.job_feedback (job_id, client_id);
