// ============================================================================
// DELETE MY ACCOUNT
//
// Apple App Store Guideline 5.1.1(v): an app that has accounts must let the
// user delete theirs from inside the app. Rejection is automatic without it.
//
// What this does:
//   * verifies the caller from their session (never from the request body)
//   * anonymises their profile (name/email/phone cleared)
//   * deletes the auth user, so the login stops working immediately
//   * tells the office, so a cleaner vanishing off the roster isn't a surprise
//
// What it deliberately KEEPS: completed job records, invoices and photo
// reports. Those are business and tax records tied to the property, not to the
// person, and Australian law requires them to be retained. The confirm screen
// in the app says so plainly before the user commits.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identity strictly from the verified session.
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "not signed in" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles").select("full_name, email, phone").eq("id", user.id).maybeSingle();
    const wasName = profile?.full_name || user.email || "a user";

    // 1. Anonymise the profile — personal details go, the row stays so job
    //    history doesn't break with dangling references.
    await supabase.from("profiles").update({
      full_name: "Deleted account",
      email: null,
      phone: null,
    }).eq("id", user.id);

    // 2. Revoke access: portal links off, roles removed.
    await supabase.from("client_properties")
      .update({ portal_active: false }).eq("client_id", user.id);
    await supabase.from("user_roles").delete().eq("user_id", user.id);

    // 3. Delete the auth user — the login stops working from this moment.
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    // 4. Tell the office (non-blocking).
    try {
      const { data: admins } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      for (const a of (admins || [])) {
        await supabase.from("notifications").insert({
          user_id: (a as any).user_id,
          type: "account",
          title: "⚠️ Account deleted",
          message: `${wasName} deleted their account from the app. Job history and invoices have been kept.`,
          link: "/staff",
        });
      }
    } catch { /* never block the deletion on a notification */ }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("delete-my-account error:", err);
    return new Response(JSON.stringify({ error: err.message || "Could not delete account" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
