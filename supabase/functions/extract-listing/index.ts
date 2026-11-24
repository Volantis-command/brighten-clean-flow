// extract-listing: turns a pasted property listing (text, a link, or
// screenshots) into the fields the internal Pricing page needs.
// Admin only. Read only: it writes nothing to the database.
import Anthropic from "npm:@anthropic-ai/sdk@1.13.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://app.brightly.cleaning",
  "http://localhost:5173",
  "http://localhost:8080",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://app.brightly.cleaning",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

const MAX_TEXT = 60_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 3_000_000; // ~2.2 MB per image after base64

const int = (desc: string) => ({ type: "integer", description: desc });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "property_name", "address", "property_type", "bedrooms", "bathrooms", "separate_toilets",
    "living_areas", "levels", "kitchens", "beds", "outdoor", "pool", "granny_flat", "sleeps",
    "notes", "unsure",
  ],
  properties: {
    property_name: { type: ["string", "null"], description: "Listing title or property name, if given" },
    address: { type: ["string", "null"], description: "Street address or suburb, if given" },
    property_type: { type: "string", enum: ["apartment", "house"] },
    bedrooms: int("Bedrooms"),
    bathrooms: int("Full bathrooms and ensuites"),
    separate_toilets: int("Toilets NOT inside a bathroom (powder rooms, separate WCs). Half baths count here."),
    living_areas: int("Lounge, family, media, rumpus, games rooms. At least 1."),
    levels: int("Storeys inside the property. Apartments are usually 1. At least 1."),
    kitchens: int("Kitchens, including one in a granny flat. At least 1."),
    beds: {
      type: "object",
      additionalProperties: false,
      required: ["king", "queen", "double", "king_single", "single", "bunk", "sofa"],
      properties: {
        king: int("King beds"),
        queen: int("Queen beds"),
        double: int("Double beds"),
        king_single: int("King single beds"),
        single: int("Single beds"),
        bunk: int("Bunk beds. One bunk bed (two tiers) counts as 1"),
        sofa: int("Sofa beds"),
      },
    },
    outdoor: { type: "boolean", description: "Private balcony, deck, terrace, patio, courtyard or yard to clean" },
    pool: { type: "boolean", description: "PRIVATE pool or spa. A shared resort or building pool is false." },
    granny_flat: { type: "boolean", description: "Granny flat, studio, self-contained annex or guest house" },
    sleeps: { type: ["integer", "null"], description: "Maximum guests, if stated" },
    notes: {
      type: "string",
      description: "One or two short sentences on anything else that adds cleaning time (office pod, media room, BBQ, outdoor kitchen, shared pool). Empty string if nothing.",
    },
    unsure: {
      type: "array",
      items: {
        type: "string",
        enum: ["property_type", "bedrooms", "bathrooms", "separate_toilets", "living_areas", "levels", "kitchens", "beds", "outdoor", "pool", "granny_flat"],
      },
      description: "Fields that were guessed or inferred rather than stated in the listing",
    },
  },
};

const SYSTEM = `You read short-stay and real estate property listings for an Airbnb cleaning company on the Gold Coast, Australia. You pull out the facts that decide how long a turnover clean takes. Only use what the listing says or clearly shows. When the listing does not state something, make the most reasonable guess and add that field to "unsure". Never invent features.

Rules:
- Count each bed. "2 singles" is 2 single beds. "Bunk room with 2 bunks" is 2 bunk beds. A trundle counts as a single.
- If the beds are not listed, infer them from the bedrooms and the guest count (usually a king or queen per bedroom, extra guests in singles or bunks) and add "beds" to unsure.
- An ensuite is a bathroom. A powder room or separate WC is a separate toilet.
- Apartments and units are "apartment". Houses, townhouses, villas and duplexes are "house".
- A granny flat, studio or self-contained annex is granny_flat true, and its bathroom and kitchen still count in the totals.
- Communal facilities (shared resort pool, building gym) are not the guest's to clean. Mention them in notes, never as pool true.`;

/** Strip a fetched page down to what describes the property. */
function pageToText(html: string) {
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const metas = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:title|og:description)["'][^>]*content=["']([^"']*)["']/gi)]
    .map((m) => m[1]).join("\n");
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return [metas, ld, body].filter(Boolean).join("\n\n").slice(0, MAX_TEXT);
}

async function fetchListing(url: string): Promise<{ text?: string; error?: string }> {
  let u: URL;
  try { u = new URL(url); } catch { return { error: "That link doesn't look right." }; }
  if (!/^https?:$/.test(u.protocol)) return { error: "Only web links work." };
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname) || u.hostname.endsWith(".internal")) {
    return { error: "That link isn't a public website." };
  }
  if (/(^|\.)realestate\.com\.au$/i.test(u.hostname)) {
    return { error: "realestate.com.au blocks automatic reading. Copy the listing text (or screenshot it) and paste that instead." };
  }
  try {
    const res = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { error: `That site refused the request (${res.status}). Paste the listing text or a screenshot instead.` };
    const text = pageToText(await res.text());
    if (text.length < 200) return { error: "That page had almost no readable text, probably a bot check. Paste the listing text or a screenshot instead." };
    return { text };
  } catch {
    return { error: "Couldn't open that link. Paste the listing text or a screenshot instead." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST only" });

  // Admin only.
  const authHeader = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await sb.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return json(req, 401, { error: "Not signed in" });
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", uid);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) return json(req, 403, { error: "Admins only" });

  let body: { text?: string; url?: string; images?: { media_type: string; data: string }[] };
  try { body = await req.json(); } catch { return json(req, 400, { error: "Bad request" }); }

  let text = String(body.text ?? "").trim();
  const images = (body.images ?? []).slice(0, MAX_IMAGES)
    .filter((i) => /^image\/(png|jpeg|webp|gif)$/.test(i?.media_type) && typeof i.data === "string" && i.data.length < MAX_IMAGE_B64);

  // A bare link in the box is treated as the URL.
  const url = String(body.url ?? "").trim() || (/^https?:\/\/\S+$/.test(text) ? text : "");
  if (url) {
    if (text === url) text = "";
    const fetched = await fetchListing(url);
    if (fetched.error && !text && images.length === 0) return json(req, 422, { error: fetched.error });
    if (fetched.text) text = `${text}\n\nPAGE AT ${url}:\n${fetched.text}`.trim();
  }
  if (!text && images.length === 0) return json(req, 400, { error: "Paste the listing text, a link or a screenshot first." });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(req, 500, { error: "AI key not configured" });
  const client = new Anthropic({ apiKey });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map((i) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: i.media_type as "image/png", data: i.data },
    })),
    { type: "text", text: `Listing:\n\n${text.slice(0, MAX_TEXT) || "(see the screenshots above)"}` },
  ];

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") return json(req, 422, { error: "Couldn't read that listing. Try pasting the text." });
    if (response.stop_reason === "max_tokens") return json(req, 502, { error: "The listing was too long to read. Paste just the description." });
    const out = response.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    if (!out) return json(req, 502, { error: "No answer came back. Try again." });
    return json(req, 200, { listing: JSON.parse(out.text) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(req, 429, { error: "Busy, try again in a minute." });
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic", e.status, e.message);
      return json(req, 502, { error: "The AI service had a problem. Try again." });
    }
    console.error("extract-listing", e);
    return json(req, 500, { error: "Something went wrong reading that listing." });
  }
});
