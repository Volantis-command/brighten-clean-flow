import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Bed, Bath, Clock, User, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { format, isToday, isTomorrow, differenceInHours } from "date-fns";
import { toast } from "sonner";
import ActiveJobView from "@/components/cleaner-portal/ActiveJobView";

type TokenState =
  | { status: "loading" }
  | { status: "expired" }
  | { status: "error"; message: string }
  | { status: "valid"; job: any; staff: any; property: any; lockboxCode: string | null };

export default function CleanerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<TokenState>({ status: "loading" });
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "No token provided." });
      return;
    }
    loadToken(token);
  }, [token]);

  async function loadToken(t: string) {
    setState({ status: "loading" });

    // 1. Look up the token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("cleaner_job_tokens")
      .select("*")
      .eq("token", t)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      setState({ status: "expired" });
      return;
    }

    // 2. Check 24-hour expiry
    const age = differenceInHours(new Date(), new Date(tokenRow.created_at));
    if (age > 24) {
      setState({ status: "expired" });
      return;
    }

    // 3. Mark used_at on first use
    if (!tokenRow.used_at) {
      await supabase
        .from("cleaner_job_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenRow.id);
    }

    // 4. Load job + property + staff
    const [jobRes, staffRes] = await Promise.all([
      supabase.from("jobs").select("*, properties(*)").eq("id", tokenRow.job_id).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", tokenRow.staff_id).maybeSingle(),
    ]);

    if (!jobRes.data) {
      setState({ status: "error", message: "Job not found." });
      return;
    }

    setState({
      status: "valid",
      job: jobRes.data,
      staff: staffRes.data,
      property: jobRes.data.properties,
      lockboxCode: jobRes.data.status === "in_progress" || jobRes.data.status === "completed"
        ? (jobRes.data.properties as any)?.lockbox_code ?? null
        : null,
    });
  }

  function formatAuPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, "");
    if (cleaned.startsWith("+61")) return cleaned;
    if (cleaned.startsWith("61") && cleaned.length >= 11) return "+" + cleaned;
    if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
    return "+61" + cleaned;
  }

  async function handleCheckIn() {
    if (state.status !== "valid") return;
    const { job, staff, property } = state;
    setCheckingIn(true);

    const now = new Date();
    const checkInIso = now.toISOString();
    const timeStr = format(now, "h:mma").toLowerCase();

    // 1. Update job status
    const { error: updateErr } = await supabase
      .from("jobs")
      .update({ status: "in_progress", check_in_time: checkInIso })
      .eq("id", job.id);

    if (updateErr) {
      toast.error("Check-in failed. Please try again.");
      setCheckingIn(false);
      return;
    }

    // 2. Reveal lockbox code
    const lockbox = property?.lockbox_code ?? null;

    // 3. Send SMS to client (fire-and-forget, don't block check-in)
    const clientPhone = property?.client_name ? null : null; // We need billing_email or a phone
    // Use the property's billing_email field or client_name to find phone — 
    // For now, get client contact from client_properties
    sendCheckInSms(job, staff, property, timeStr).catch((err) =>
      console.error("SMS send failed (non-blocking):", err)
    );

    // 4. Update local state
    setState({
      ...state,
      job: { ...job, status: "in_progress", check_in_time: checkInIso },
      lockboxCode: lockbox,
    });
    setCheckingIn(false);
    toast.success("Checked in successfully!");
  }

  async function sendCheckInSms(job: any, staff: any, property: any, timeStr: string) {
    // Find client phone — check client_properties for this property to get client profile
    const { data: cpRows } = await supabase
      .from("client_properties")
      .select("client_id")
      .eq("property_id", property?.id)
      .limit(1);

    const clientId = cpRows?.[0]?.client_id;
    if (!clientId) return;

    const { data: clientProfile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientProfile?.phone) return;

    const clientFirst = (clientProfile.full_name ?? "").split(" ")[0] || "there";
    const cleanerFirst = (staff?.full_name ?? "").split(" ")[0] || "Your cleaner";
    const propName = property?.property_name ?? "your property";
    const isAirbnb = property?.client_type === "airbnb";

    const message = isAirbnb
      ? `Hi ${clientFirst}, your Brightly cleaner ${cleanerFirst} has checked in to ${propName}. ${timeStr}. Property will be guest-ready well before checkin. ✓`
      : `Hi ${clientFirst}, your Brightly cleaner ${cleanerFirst} has just arrived at your property. Check-in verified ${timeStr}. 🧹`;

    await supabase.functions.invoke("send-job-sms", {
      body: { to: formatAuPhone(clientProfile.phone), message },
    });
  }

  // --- RENDER ---

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[hsl(166,73%,16%)]">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <p className="text-white/60 text-sm mt-3">Loading your job…</p>
      </div>
    );
  }

  if (state.status === "expired") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-xl font-bold text-foreground">This link has expired</h1>
        <p className="text-muted-foreground mt-2 max-w-xs">
          Job links are valid for 24 hours. Please contact Brightly for a new link.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-muted-foreground mt-2">{state.message}</p>
      </div>
    );
  }

  const { job, staff, property } = state;
  const firstName = staff?.full_name?.split(" ")[0] ?? "Cleaner";
  const jobDate = new Date(job.scheduled_date + "T" + (job.scheduled_time ?? "00:00"));
  const propertyType = property?.client_type === "airbnb" ? "Airbnb Clean" : "House Clean";

  function formatJobDate(d: Date) {
    if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
    if (isTomorrow(d)) return `Tomorrow, ${format(d, "h:mm a")}`;
    return format(d, "EEE d MMM, h:mm a");
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-800" },
    in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-800" },
    completed: { label: "Completed", color: "bg-green-100 text-green-800" },
  };
  const st = statusConfig[job.status] ?? { label: job.status, color: "bg-muted text-muted-foreground" };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-[hsl(166,73%,16%)] text-white px-5 py-5 safe-area-top">
        <h1 className="text-xl font-extrabold tracking-tight" style={{ fontFamily: "Nunito, sans-serif" }}>
          Brightly<span className="text-[hsl(49,99%,50%)]">.</span>
        </h1>
        <p className="text-white/80 text-base mt-1">Hi {firstName} 👋</p>
      </header>

      {/* Job Card */}
      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full">
        <Card className="shadow-md border-border">
          <CardContent className="p-5 space-y-4">
            {/* Property name & address */}
            <div>
              <h2 className="text-lg font-bold text-foreground leading-tight">
                {property?.property_name ?? "Property"}
              </h2>
              <p className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {property?.address ?? "No address"}
              </p>
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-semibold text-xs">
                {propertyType}
              </Badge>
              <Badge className={`${st.color} border-0 font-semibold text-xs`}>
                {st.label}
              </Badge>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="font-medium text-foreground">{formatJobDate(jobDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 shrink-0" />
                <span className="font-medium text-foreground">{property?.client_name ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bed className="h-4 w-4 shrink-0" />
                <span className="font-medium text-foreground">{property?.bedrooms ?? 0} bed</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bath className="h-4 w-4 shrink-0" />
                <span className="font-medium text-foreground">{property?.bathrooms ?? 0} bath</span>
              </div>
            </div>

            {/* Access notes (non-sensitive) */}
            {property?.access_notes && (
              <div className="bg-secondary rounded-lg p-3 text-sm">
                <p className="font-semibold text-secondary-foreground text-xs uppercase tracking-wide mb-1">
                  Access Notes
                </p>
                <p className="text-foreground">{property.access_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action area */}
        {job.status === "scheduled" && (
          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold rounded-xl bg-[hsl(166,73%,16%)] hover:bg-[hsl(166,73%,22%)] text-white"
            onClick={handleCheckIn}
            disabled={checkingIn}
          >
            {checkingIn ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : null}
            CHECK IN
          </Button>
        )}

        {/* Lockbox code — only shown after check-in */}
        {(job.status === "in_progress" || job.status === "completed") && state.lockboxCode && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <KeyRound className="h-6 w-6 text-primary shrink-0" />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Access Code</p>
                <p className="text-xl font-bold text-foreground tracking-widest">{state.lockboxCode}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {job.status === "in_progress" && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-5 text-center space-y-2">
              <p className="text-amber-800 font-bold text-lg">Clean in progress…</p>
              <p className="text-amber-700 text-sm">
                Checked in at {job.check_in_time ? format(new Date(job.check_in_time), "h:mm a") : "—"}
              </p>
              <p className="text-muted-foreground text-xs mt-2">
                Checklist coming soon
              </p>
            </CardContent>
          </Card>
        )}

        {job.status === "completed" && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-5 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
              <p className="text-green-800 font-bold text-lg">Clean Complete ✓</p>
              {job.report_token && (
                <a
                  href={`/report/${job.report_token}`}
                  className="text-primary underline text-sm font-medium"
                >
                  View Report
                </a>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-muted-foreground py-4 px-4">
        Powered by Brightly
      </footer>
    </div>
  );
}
