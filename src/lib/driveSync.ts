import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget Google Drive sync. Errors are logged but never block the user.
 */
export async function syncToDrive(
  action: "sync_job_form" | "sync_qc_audit" | "sync_property",
  payload: Record<string, string>
) {
  try {
    const { error } = await supabase.functions.invoke("google-drive-sync", {
      body: { action, ...payload },
    });
    if (error) {
      console.error("Drive sync error:", error);
    }
  } catch (e) {
    console.error("Drive sync failed:", e);
  }
}
