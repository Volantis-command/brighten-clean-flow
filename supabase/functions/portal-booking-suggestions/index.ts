import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Client-portal access to booking_suggestions (the pending-checkout
 * queue that the iCal sync writes into). Two callers:
 *
 *   - Magic-link portal (MagicLinkPropertyPage, has a portal_token in
 *     the URL) → pass `{ token, property_id, action, … }`.
 *   - Authed in-app portal (ClientPortalPropertyPage, uses Supabase
 *     auth + a localStorage client_id) → pass `Authorization: Bearer
 *     <user-jwt>` and `{ property_id, action, … }`.
 *
 * Both paths resolve to a `client_id` server-side and verify the
 * suggestion belongs to a property the client owns before doing
 * anything. Service-role inserts bypass RLS so we don't need to add
 * client policies on booking_suggestions / jobs (admin policies stay
 * the only ones on those tables).
 *
 * Actions:
 *   - list    → returns pending suggestions for the property
 *   - approve → creates a job (status='awaiting_cleaner', no cleaner
 *               assigned — admin assigns from the schedule) and marks
 *               the suggestion converted
 *   - reject  → marks the suggestion rejected
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true, function: "portal-booking-suggestions" });

  try {
    const body = await req.json();
    const { token, property_id, action, suggestion_id, scheduled_time } = body as {
      token?: string;
      property_id?: string;
      action: "list" | "approve" | "reject";
      suggestion_id?: string;
      scheduled_time?: string;
    };
    if (!action) return json({ error: "action required" }, 400);
    if (!property_id) return json({ error: "property_id required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // ── Resolve caller → client_id ─────────────────────────────────
    let clientId: string | null = null;

    if (token) {
      const { data } = await admin
        .from("client_properties")
        .select("client_id")
        .eq("portal_token", token)
        .eq("portal_active", true)
        .maybeSingle();
      if (!data) return json({ error: "invalid or inactive portal link" }, 403);
      clientId = (data as any).client_id;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "token or auth header required" }, 401);
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "invalid auth token" }, 401);
      clientId = user.id;
    }

    // ── Verify the property belongs to this client ─────────────────
    const { data: ownership } = await admin
      .from("client_properties")
      .select("id")
      .eq("client_id", clientId)
      .eq("property_id", property_id)
      .eq("portal_active", true)
      .maybeSingle();
    if (!ownership) return json({ error: "property not linked to this client" }, 403);

    // ── Dispatch ───────────────────────────────────────────────────
    if (action === "list") {
      const { data: suggestions } = await admin
        .from("booking_suggestions")
        .select("*")
        .eq("property_id", property_id)
        .eq("status", "pending")
        .order("checkout_date", { ascending: true });
      return json({ ok: true, suggestions: suggestions || [] });
    }

    if (action === "approve") {
      if (!suggestion_id) return json({ error: "suggestion_id required" }, 400);

      const { data: suggestion } = await admin
        .from("booking_suggestions")
        .select("*")
        .eq("id", suggestion_id)
        .eq("property_id", property_id)
        .eq("status", "pending")
        .maybeSingle();
      if (!suggestion) return json({ error: "suggestion not found or already decided" }, 404);

      const { data: prop } = await admin
        .from("properties")
        .select("default_cleaner_id, price_turnover, price_inc_gst, checkout_time")
        .eq("id", property_id)
        .maybeSingle();

      const finalCleanerId = (prop as any)?.default_cleaner_id || null;
      const finalTime =
        scheduled_time ||
        (suggestion as any).suggested_clean_time ||
        (prop as any)?.checkout_time ||
        "10:00";

      const cleanDate = (suggestion as any).suggested_clean_date;

      // Guard 1 — don't double-book: refuse if a live job already exists for
      // this property on this date (Hostaway pipeline, prior approval, etc.).
      const { data: dupe } = await admin
        .from("jobs")
        .select("id")
        .eq("property_id", property_id)
        .eq("scheduled_date", cleanDate)
        .neq("status", "cancelled")
        .limit(1);
      if (dupe && dupe.length > 0) {
        // Mark the suggestion converted-to-existing so it stops nagging, but
        // don't create a second job.
        await admin.from("booking_suggestions")
          .update({ status: "converted", created_job_id: dupe[0].id, decided_at: new Date().toISOString() })
          .eq("id", suggestion_id).eq("status", "pending");
        return json({ ok: true, job_id: dupe[0].id, deduped: true });
      }

      // Mirror admin handleApprove (BookingSuggestionsPage). Client-
      // approved jobs land at awaiting_cleaner so an admin still picks
      // who goes — the client just confirms the date should be cleaned.
      const { data: job, error: jobErr } = await admin
        .from("jobs")
        .insert({
          property_id,
          scheduled_date: cleanDate,
          scheduled_time: finalTime,
          cleaner_1_id: finalCleanerId,
          status: finalCleanerId ? "confirmed" : "awaiting_cleaner",
          price_ex_gst: (prop as any)?.price_turnover || null,
          source: (suggestion as any).source,
          notes: (suggestion as any).guest_name ? `Guest: ${(suggestion as any).guest_name}` : null,
        } as any)
        .select("id, scheduled_date, scheduled_time, status")
        .single();
      if (jobErr) return json({ error: `job insert failed: ${jobErr.message}` }, 500);

      // Guard 2 — atomic claim: only convert if STILL pending. If another
      // approval already converted it, roll back the job we just made.
      const { data: claimed, error: claimErr } = await admin
        .from("booking_suggestions")
        .update({
          status: "converted",
          created_job_id: job.id,
          decided_at: new Date().toISOString(),
          // decided_by stays null on portal-approve (no staff user).
        })
        .eq("id", suggestion_id)
        .eq("status", "pending")
        .select("id");
      if (claimErr) return json({ error: `claim failed: ${claimErr.message}` }, 500);
      if (!claimed || claimed.length === 0) {
        await admin.from("jobs").delete().eq("id", job.id);
        return json({ error: "suggestion already decided" }, 409);
      }

      // Notify admin so they can assign a cleaner.
      const { data: admins } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (admins?.length) {
        await admin.from("notifications").insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            title: "Client approved a booking",
            message: `Sylvia-style: client confirmed clean for ${(suggestion as any).suggested_clean_date} — assign a cleaner.`,
            type: "client_approved_booking",
            tier: "important",
            event_type: "client_approved_booking",
            link: "/schedule",
          })),
        );
      }

      return json({ ok: true, job });
    }

    if (action === "reject") {
      if (!suggestion_id) return json({ error: "suggestion_id required" }, 400);
      const { error } = await admin
        .from("booking_suggestions")
        .update({
          status: "rejected",
          decided_at: new Date().toISOString(),
        })
        .eq("id", suggestion_id)
        .eq("property_id", property_id)
        .eq("status", "pending");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("portal-booking-suggestions error:", err);
    return json({ error: err.message || "unknown error" }, 500);
  }
});
