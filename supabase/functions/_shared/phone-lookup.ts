// Finding a person by phone number, tolerant of how the number was typed.
//
// Phone numbers reach the profiles table from several places — the admin
// staff form, the quote intake, CSV imports — and they are stored exactly
// as whoever typed them. So the same mobile can sit in the database as
// "+61499432309", "0499432309" or "+61 499 432 309".
//
// The old lookup was `phone.eq.<E.164>` OR `phone.ilike.%<last 9 digits>`.
// Both of those compare the raw stored string, so a number stored with
// spaces matches NEITHER: "+61 499 432 309" does not end in the
// contiguous run "499432309". The caller got a silent miss, and in
// request-login-otp a silent miss means no SMS is sent while the API
// still answers {ok:true}. That is how a cleaner can ask for a login
// code forever and never receive one.
//
// We keep the indexed string comparison as the fast path, because it
// resolves almost every row, and fall back to comparing digits only when
// it finds nothing.

/** Strip formatting and convert a local AU mobile to E.164. */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (/^0\d{9,10}$/.test(cleaned)) return "+61" + cleaned.slice(1);
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length >= 10) return "+" + cleaned;
  return cleaned;
}

/**
 * The comparable form of a number: digits only, last 9 kept.
 *
 * 9 digits is the length of an AU mobile without its leading 0 or +61,
 * so "0499432309", "+61499432309" and "+61 499 432 309" all reduce to
 * "499432309" and compare equal.
 */
export function phoneDigitKey(raw: string): string {
  return (raw || "").replace(/\D/g, "").slice(-9);
}

export type PhoneProfile = { id: string; phone: string | null };

/**
 * Every profile whose phone is the same number as `rawPhone`, however
 * either side happens to be formatted. Returns [] when the number is
 * unusable or belongs to nobody.
 *
 * `select` lets the caller ask for extra columns; id and phone are
 * always included because the digit comparison needs them.
 */
export async function findProfilesByPhone<T extends PhoneProfile>(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rawPhone: string,
  select = "id, phone",
): Promise<T[]> {
  const phone = normalizePhone(rawPhone);
  const key = phoneDigitKey(phone);
  if (key.length < 8) return [];

  const columns = select.includes("phone") ? select : `${select}, phone`;

  // Fast path: the stored string is already in one of the two shapes we
  // can express as a PostgREST filter.
  const { data: direct } = await supabase
    .from("profiles")
    .select(columns)
    .or(`phone.eq.${phone},phone.ilike.%${key}`);
  if (direct && direct.length > 0) return direct as T[];

  // Slow path: compare digits. Only runs when the fast path found
  // nobody, which is the case for the handful of rows stored with
  // spaces or brackets.
  const { data: all } = await supabase
    .from("profiles")
    .select(columns)
    .not("phone", "is", null);
  return ((all || []) as T[]).filter((p) => phoneDigitKey(p.phone || "") === key);
}
