import { createClient } from "npm:@supabase/supabase-js@2";

// Public iCal feed for a single (token, property_id) pair. Designed
// to be subscribed-to in Apple/Google/Outlook so the client always sees
// their cleans on their calendar.
//
// URL: /functions/v1/property-calendar-ics?token=...&property_id=...
// Returns text/calendar (RFC 5545) — past + upcoming cleans.
//
// Auth = portal_token (URL is the secret). Same model as the rest of
// the magic-link portal.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// RFC 5545 floating-time format: YYYYMMDDTHHMMSS (no timezone).
// Floating time so the client's calendar app shows the local clean
// time without us having to pick a server timezone.
function icsDateTime(date: string, time: string | null): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!time) return `${y}${pad(m)}${pad(d)}T090000`;
  const [hh, mm] = time.split(":").map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
}

function addMinutes(date: string, time: string | null, mins: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 9, mm = 0] = (time?.split(":").map(Number) || []) as number[];
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + mins));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const propertyId = url.searchParams.get("property_id");
    if (!token || !propertyId) {
      return new Response("missing token or property_id", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Token → client → ownership.
    const { data: tokenRow } = await supabase
      .from("client_properties").select("client_id")
      .eq("portal_token", token).eq("portal_active", true).maybeSingle();
    if (!tokenRow) return new Response("invalid or inactive portal link", { status: 403 });

    const { data: ownership } = await supabase
      .from("client_properties").select("id")
      .eq("client_id", tokenRow.client_id).eq("property_id", propertyId).eq("portal_active", true)
      .maybeSingle();
    if (!ownership) return new Response("you do not own this property", { status: 403 });

    const { data: prop } = await supabase
      .from("properties").select("property_name, address").eq("id", propertyId).maybeSingle();
    const propertyName = prop?.property_name || "Property";

    // 6 months back, all future. Most calendar apps cache the feed
    // anyway; no need to dump the entire history.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, scheduled_date, scheduled_time, status, estimated_duration, clean_type")
      .eq("property_id", propertyId)
      .gte("scheduled_date", sixMonthsAgoStr)
      .order("scheduled_date", { ascending: true });

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Brightly//Cleaning Schedule//EN",
      `X-WR-CALNAME:${escapeIcs(`Brightly cleans — ${propertyName}`)}`,
      "X-WR-TIMEZONE:UTC",
      "METHOD:PUBLISH",
    ];

    for (const j of jobs || []) {
      const summary = j.status === "cancelled"
        ? `Cancelled clean — ${propertyName}`
        : j.status === "completed" || j.status === "complete"
          ? `Cleaned — ${propertyName}`
          : `Clean — ${propertyName}`;
      const durationMin = j.estimated_duration || 120;
      lines.push(
        "BEGIN:VEVENT",
        `UID:job-${j.id}@brightly.cleaning`,
        `DTSTAMP:${icsDateTime(j.scheduled_date, j.scheduled_time).replace("T", "T") + "Z"}`,
        `DTSTART:${icsDateTime(j.scheduled_date, j.scheduled_time)}`,
        `DTEND:${addMinutes(j.scheduled_date, j.scheduled_time, durationMin)}`,
        `SUMMARY:${escapeIcs(summary)}`,
        `DESCRIPTION:${escapeIcs(`Status: ${j.status}${j.clean_type ? `\nType: ${j.clean_type}` : ""}`)}`,
        `LOCATION:${escapeIcs(prop?.address || "")}`,
        j.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
        "END:VEVENT",
      );
    }

    lines.push("END:VCALENDAR");
    const body = lines.join("\r\n") + "\r\n";

    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="brightly-${propertyName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return new Response(`error: ${(err as Error).message}`, { status: 500 });
  }
});
