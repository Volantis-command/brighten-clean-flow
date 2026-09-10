/**
 * Pull the real message out of a failed edge function call.
 *
 * supabase-js turns any non-2xx into a FunctionsHttpError whose message is the
 * useless "Edge Function returned a non-2xx status code". The message the
 * function actually wrote is in the JSON body, reachable only through
 * error.context. Throwing the raw error means a deliberate, helpful 409 like
 * "this phone number already belongs to a client account" reaches the user as
 * gibberish, and the admin has no idea what to change.
 *
 * Usage:
 *   const { data, error } = await supabase.functions.invoke('fn', { body });
 *   if (error) throw new Error(await edgeErrorMessage(error));
 *   if (data?.error) throw new Error(data.error);
 */
export async function edgeErrorMessage(error: unknown): Promise<string> {
  const fallback =
    (error as any)?.message || 'That request failed. Please try again.';
  try {
    const ctx = (error as any)?.context;
    if (!ctx) return fallback;

    // context is a Response on a real HTTP failure. Clone it, because the
    // caller may still want to read it and a body can only be consumed once.
    if (typeof ctx.clone === 'function' && typeof ctx.json === 'function') {
      const body = await ctx.clone().json().catch(() => null);
      if (body?.error) return String(body.error);
      const text = await ctx.clone().text().catch(() => '');
      if (text) return text.slice(0, 300);
      return fallback;
    }

    if (typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null);
      if (body?.error) return String(body.error);
    }
    return fallback;
  } catch {
    return fallback;
  }
}
