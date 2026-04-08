import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if cleaner has expired SOPs
    const { data: onboarding } = await supabase
      .from("cleaner_onboarding")
      .select("sops_resign_due, full_name")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!onboarding?.sops_resign_due) {
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const sopsDue = onboarding.sops_resign_due;

    if (sopsDue < today) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "Your SOP acknowledgements have expired. Please re-sign before clocking on.",
          sops_resign_due: sopsDue,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if approaching expiry (30 days) - create notification
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const thirtyDayStr = thirtyDaysFromNow.toISOString().split("T")[0];

    if (sopsDue <= thirtyDayStr && sopsDue >= today) {
      // Check if we already sent a notification recently
      const { data: existingNotif } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user_id)
        .eq("type", "sop_resign_reminder")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .limit(1);

      if (!existingNotif?.length) {
        // Notify admins
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        if (admins?.length) {
          const notifications = admins.map((a: any) => ({
            user_id: a.user_id,
            type: "sop_resign_reminder",
            title: "SOP Re-sign Due Soon",
            message: `${onboarding.full_name || "A cleaner"}'s SOP acknowledgements expire on ${sopsDue}. Please arrange re-signing.`,
            link: "/staff",
          }));
          await supabase.from("notifications").insert(notifications);
        }
      }
    }

    return new Response(JSON.stringify({ allowed: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
