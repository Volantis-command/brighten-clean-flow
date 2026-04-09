
CREATE TABLE IF NOT EXISTS public.staff_magic_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_magic_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage staff tokens"
  ON public.staff_magic_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_staff_magic_tokens_token ON public.staff_magic_tokens(token);
CREATE INDEX idx_staff_magic_tokens_staff ON public.staff_magic_tokens(staff_id);
