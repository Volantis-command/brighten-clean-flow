
-- Add deposit columns to quote_requests
ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_refunded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_refund_reason text DEFAULT NULL;

-- Add deposit columns to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_refunded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_refund_reason text DEFAULT NULL;
