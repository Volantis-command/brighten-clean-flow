-- Allow anon to SELECT staff_magic_tokens (needed for magic link verification before auth)
CREATE POLICY "Anon can select token by value"
ON public.staff_magic_tokens
FOR SELECT
TO anon
USING (true);

-- Allow anon to UPDATE used flag on staff_magic_tokens (mark token as consumed)
CREATE POLICY "Anon can mark token used"
ON public.staff_magic_tokens
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);