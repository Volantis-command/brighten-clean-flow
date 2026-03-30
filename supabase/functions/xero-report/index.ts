import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const XERO_TENANT_ID = "7e3919fe-824b-4afa-84ae-d7b7c70b61d2";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

const REPORT_ENDPOINTS: Record<string, string> = {
  profit_loss: "Reports/ProfitAndLoss",
  balance_sheet: "Reports/BalanceSheet",
  trial_balance: "Reports/TrialBalance",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Protect with service role key
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { report_type, from_date, to_date } = await req.json();

    if (!report_type || !REPORT_ENDPOINTS[report_type]) {
      return new Response(
        JSON.stringify({ error: `Invalid report_type. Options: ${Object.keys(REPORT_ENDPOINTS).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch stored Xero token
    const { data: tokenData, error: tokenError } = await supabase
      .from("xero_tokens")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "No Xero token found", detail: tokenError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = tokenData.access_token;

    // Auto-refresh if expired (with 60s buffer)
    const expiresAt = new Date(tokenData.expires_at ?? tokenData.token_expiry ?? 0);
    if (expiresAt <= new Date(Date.now() + 60_000)) {
      const clientId = Deno.env.get("XERO_CLIENT_ID");
      const clientSecret = Deno.env.get("XERO_CLIENT_SECRET");

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ error: "XERO_CLIENT_ID or XERO_CLIENT_SECRET missing from environment" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshRes = await fetch(XERO_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenData.refresh_token,
        }),
      });

      if (!refreshRes.ok) {
        return new Response(
          JSON.stringify({ error: "Token refresh failed", detail: await refreshRes.text() }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshed = await refreshRes.json();
      accessToken = refreshed.access_token;

      await supabase
        .from("xero_tokens")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("id", tokenData.id);
    }

    // Build Xero API request
    const params = new URLSearchParams();
    if (from_date) params.set("fromDate", from_date);
    if (to_date) params.set("toDate", to_date);

    const url = `${XERO_API_BASE}/${REPORT_ENDPOINTS[report_type]}${params.size ? "?" + params.toString() : ""}`;

    const xeroRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": XERO_TENANT_ID,
        Accept: "application/json",
      },
    });

    const xeroData = await xeroRes.json();

    if (!xeroRes.ok) {
      return new Response(
        JSON.stringify({ error: "Xero API error", status: xeroRes.status, detail: xeroData }),
        { status: xeroRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(xeroData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
