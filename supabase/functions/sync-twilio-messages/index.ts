// Pull every text, in and out, from Twilio into sms_conversations.
//
// There are 26 places in this codebase that send an SMS. Two of them record it.
// Rather than editing and redeploying 26 functions and still missing whatever
// gets added next month, this asks Twilio, which is the only party that sees
// all of them, including anything sent by hand from the Twilio console.
//
// Runs every five minutes on pg_cron. Deduped on Twilio's own message SID, so
// running it twice, or racing a sender that already logged its own message, is
// harmless.
//
// POST {"backfill_days": 90} to reach further back the first time.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Everything is keyed on E.164, because that is the one form both Twilio and
// our own records can agree on.
function toE164(raw: string): string {
  const c = (raw || "").replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(c)) return "+61" + c.slice(1);
  if (c.startsWith("+")) return c;
  if (/^61\d{9}$/.test(c)) return "+" + c;
  if (/^4\d{8}$/.test(c)) return "+61" + c;
  return c;
}

// The same number as people actually typed it into our own forms, so a lookup
// against profiles.phone or quote_requests.phone stands a chance of matching.
function localForms(e164: string): string[] {
  const out = new Set<string>([e164]);
  if (e164.startsWith("+61") && e164.length === 12) {
    const rest = e164.slice(3);              // 412345678
    out.add("0" + rest);                     // 0412345678
    out.add("61" + rest);
    out.add(rest);
  }
  return [...out];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!accountSid || !authToken) return json({ error: "Twilio is not configured" }, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let backfillDays = 0;
    try {
      const parsed = await req.json();
      backfillDays = Number(parsed?.backfill_days) || 0;
    } catch { /* cron posts {} or nothing */ }

    // On the routine run, one page of 200 covers five minutes many times over.
    // A backfill walks Twilio's paging until it runs out or hits the cutoff.
    const maxPages = backfillDays > 0 ? 50 : 1;
    const cutoff = backfillDays > 0
      ? new Date(Date.now() - backfillDays * 86400_000)
      : null;

    const auth = "Basic " + btoa(`${accountSid}:${authToken}`);
    let url: string | null =
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=200`;

    const rows: any[] = [];
    let pages = 0;
    let reachedCutoff = false;

    while (url && pages < maxPages && !reachedCutoff) {
      const res: Response = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) {
        // Twilio's own words. Do not pretend this worked.
        const detail = await res.text().catch(() => "");
        return json({ error: `Twilio rejected the list request (${res.status})`, detail: detail.slice(0, 400) }, 502);
      }
      const page: any = await res.json();
      pages++;

      for (const m of page.messages || []) {
        const sent = m.date_sent || m.date_created;
        const at = sent ? new Date(sent) : null;
        if (cutoff && at && at < cutoff) { reachedCutoff = true; break; }

        const inbound = String(m.direction || "").startsWith("inbound");
        // The customer's number, whichever end of the message they are on.
        const theirNumber = toE164(inbound ? m.from : m.to);
        if (!theirNumber || !m.body) continue;

        rows.push({
          twilio_sid: m.sid,
          phone: theirNumber,
          direction: inbound ? "in" : "out",
          body: m.body,
          delivery_status: m.status || null,
          error_code: m.error_code != null ? String(m.error_code) : null,
          created_at: at ? at.toISOString() : new Date().toISOString(),
        });
      }

      url = page.next_page_uri ? `https://api.twilio.com${page.next_page_uri}` : null;
    }

    if (!rows.length) return json({ synced: 0, pages });

    // Resolve who each number belongs to, in two queries rather than one per
    // message. A person can be both a lead and a client; client wins, because
    // that is the more advanced relationship.
    const numbers = [...new Set(rows.map((r) => r.phone))];
    const lookups = numbers.flatMap(localForms);

    const [{ data: profiles }, { data: leads }] = await Promise.all([
      sb.from("profiles").select("id, phone").in("phone", lookups),
      sb.from("quote_requests").select("id, phone").in("phone", lookups),
    ]);

    const profileByPhone = new Map<string, string>();
    for (const p of profiles || []) if (p.phone) profileByPhone.set(toE164(p.phone), p.id);
    const leadByPhone = new Map<string, string>();
    for (const l of leads || []) if (l.phone) leadByPhone.set(toE164(l.phone), l.id);

    for (const r of rows) {
      const profileId = profileByPhone.get(r.phone) || null;
      const leadId = leadByPhone.get(r.phone) || null;
      r.profile_id = profileId;
      r.lead_id = leadId;
      r.sender_type = profileId ? "client" : leadId ? "lead" : "unknown";
    }

    // Insert only what Twilio has that we do not. ignoreDuplicates matters:
    // a message a sender already logged has better information than this does,
    // it knows Jess wrote it rather than "some client", and overwriting would
    // throw that away. Delivery status on those rows comes from twilio-status.
    const { error } = await sb
      .from("sms_conversations")
      .upsert(rows, { onConflict: "twilio_sid", ignoreDuplicates: true });

    if (error) {
      console.error("sync-twilio-messages upsert:", error);
      return json({ error: error.message }, 500);
    }

    console.log(`sync-twilio-messages: ${rows.length} messages across ${pages} page(s)`);
    return json({ synced: rows.length, pages, backfill_days: backfillDays });
  } catch (err: any) {
    console.error("sync-twilio-messages:", err);
    return json({ error: err?.message || "Sync failed" }, 500);
  }
});
