-- Tips from clients to cleaners.
--
-- Client portal "Tip Sarah" button → Stripe Checkout Session → on
-- payment, this row goes from 'pending' → 'paid'. Cleaner payouts
-- (disbursing the tipped amount to the cleaner) are out-of-scope for
-- this MVP — Brendan can settle manually until Stripe Connect is
-- wired up later. The tip is captured to Brightly's Stripe account
-- in the meantime so no funds are lost.
--
-- One row per (job_id, client) Checkout attempt — multiple attempts
-- are allowed, but only the first 'paid' row counts. Webhook is
-- idempotent on stripe_payment_intent_id.

CREATE TABLE IF NOT EXISTS public.cleaner_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  cleaner_id UUID,
  client_id UUID,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'aud',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cleaner_tips_cleaner ON public.cleaner_tips(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_tips_job ON public.cleaner_tips(job_id);

ALTER TABLE public.cleaner_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tips"
  ON public.cleaner_tips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Cleaners view their own tips"
  ON public.cleaner_tips FOR SELECT TO authenticated
  USING (cleaner_id = auth.uid());
