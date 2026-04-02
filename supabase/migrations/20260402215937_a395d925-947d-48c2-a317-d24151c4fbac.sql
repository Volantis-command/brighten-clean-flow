
CREATE TABLE public.client_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.client_tokens
  FOR ALL USING (false) WITH CHECK (false);
