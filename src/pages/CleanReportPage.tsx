import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInMinutes } from "date-fns";
import { CheckCircle2, Minus, X, Printer, AlertTriangle } from "lucide-react";
import { Logo } from '@/components/Logo';

interface ReportData {
  job: any;
  property: any;
  cleaners: any[];
  checklistItems: any[];
  completions: any[];
  restockingItems: any[];
  restockingCompletions: any[];
  photos: any[];
  audit: any | null;
  issues: any[];
}

export default function CleanReportPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }

    (async () => {
      const { data: job } = await supabase
        .from("jobs")
        .select("*, properties(property_name, address, suburb, client_type)")
        .eq("report_token", token)
        .maybeSingle();

      if (!job) { setNotFound(true); setLoading(false); return; }

      const property = (job as any).properties;
      const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean);
      const { data: cleaners } = cleanerIds.length
        ? await supabase.from("profiles").select("full_name").in("id", cleanerIds)
        : { data: [] };

      const { data: checklistItems } = await supabase
        .from("property_sop_items")
        .select("*")
        .eq("property_id", job.property_id!)
        .eq("active", true)
        .order("room")
        .order("sort_order");

      const { data: completions } = await supabase
        .from("job_checklist_completions")
        .select("*")
        .eq("job_id", job.id);

      const { data: restockingItems } = await supabase
        .from("property_restocking_items")
        .select("*")
        .eq("property_id", job.property_id!)
        .eq("active", true)
        .order("sort_order");

      const { data: restockingCompletions } = await supabase
        .from("job_restocking_completions")
        .select("*")
        .eq("job_id", job.id);

      const { data: photos } = await supabase
        .from("job_photos")
        .select("*")
        .eq("job_id", job.id)
        .order("room_label");

      // QC audit + issues are part of the completion record the
      // client expects to see in the report.
      const { data: audit } = await supabase
        .from("qc_audits")
        .select("*")
        .eq("job_id", job.id)
        .maybeSingle();

      const { data: issues } = await supabase
        .from("property_issues")
        .select("*")
        .eq("job_id", job.id);

      setData({
        job,
        property,
        cleaners: cleaners || [],
        checklistItems: checklistItems || [],
        completions: completions || [],
        restockingItems: restockingItems || [],
        restockingCompletions: restockingCompletions || [],
        photos: photos || [],
        audit: audit || null,
        issues: issues || [],
      });
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground animate-pulse">Loading report…</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">Report not found</h1>
        <p className="text-muted-foreground mt-2">This report link may be invalid or expired.</p>
      </div>
    );
  }

  const { job, property, cleaners, checklistItems, completions, restockingItems, restockingCompletions, photos, audit, issues } = data;
  const signatures = (job.completion_signatures && typeof job.completion_signatures === "object")
    ? job.completion_signatures as { cleaner_1?: { name: string; signature_data_url: string }; cleaner_2?: { name: string; signature_data_url: string } }
    : {};

  // Duration
  const durationText = (() => {
    if (!job.check_in_time || !job.check_out_time) return null;
    const mins = differenceInMinutes(new Date(job.check_out_time), new Date(job.check_in_time));
    if (mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}hr${h > 1 ? "s" : ""} ${m > 0 ? `${m}min` : ""}`.trim() : `${m}min`;
  })();

  const finishedTime = job.check_out_time
    ? format(new Date(job.check_out_time), "EEEE d MMMM, 'finished' h:mmaaa")
    : job.scheduled_date
      ? format(new Date(job.scheduled_date), "EEEE d MMMM")
      : "";

  const cleanerNames = cleaners.map((c: any) => c.full_name).join(" & ") || "—";

  // Checklist grouped by room
  const completionSet = new Set((completions || []).filter((c: any) => c.completed).map((c: any) => c.sop_item_id));
  const roomGroups: Record<string, any[]> = {};
  (checklistItems || []).forEach((item: any) => {
    const room = item.room || "General";
    if (!roomGroups[room]) roomGroups[room] = [];
    roomGroups[room].push(item);
  });

  const totalItems = checklistItems.length;
  const completedItems = checklistItems.filter((i: any) => completionSet.has(i.id)).length;
  const allComplete = totalItems > 0 && completedItems === totalItems;

  // Restocking
  const restockCompSet = new Set((restockingCompletions || []).filter((c: any) => c.completed).map((c: any) => c.restocking_item_id));
  const isAirbnb = property?.client_type === "airbnb" || property?.client_type === "short_term_rental";

  // Photos grouped by room
  const photosByRoom: Record<string, any[]> = {};
  (photos || []).forEach((p: any) => {
    const room = p.room_label || "General";
    if (!photosByRoom[room]) photosByRoom[room] = [];
    photosByRoom[room].push(p);
  });

  return (
    <div className="min-h-screen bg-background print:bg-white clean-report-root">
      {/*
        Print stylesheet — Tailwind's bg-background / text-foreground
        resolve through CSS variables that are dark in dark mode, so the
        default print output came out near-black (Brendan: "the PDF
        download isn't working"). Force the entire page to a light, ink-
        friendly palette only when printing. Also paginate photos so
        they don't get cropped halfway across a page break.
      */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: #ffffff !important; color: #1a1a1a !important; }
          .clean-report-root, .clean-report-root * {
            background: transparent !important;
            color: #1a1a1a !important;
            box-shadow: none !important;
            border-color: #d1d5db !important;
          }
          .clean-report-root .clean-report-header {
            background: #ffffff !important;
            color: #1B4332 !important;
            border-bottom: 2px solid #1B4332 !important;
          }
          .clean-report-root .clean-report-header * { color: #1B4332 !important; }
          .clean-report-root img, .clean-report-root section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .clean-report-root img { max-width: 100% !important; height: auto !important; }
          /* Ensure browser prints background colors on photos / signatures */
          .clean-report-root { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      {/* Header */}
      <div className="clean-report-header bg-[#1B4332] text-white px-5 pt-8 pb-6 relative">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "Nunito, sans-serif" }}>
          <Logo variant="cream" className="h-9 w-auto inline-block" />
        </h1>
        <p className="text-white/70 text-sm mt-1">Clean Report</p>
        <h2 className="text-xl font-bold mt-4">{property?.property_name || "Property"}</h2>
        <p className="text-white/70 text-sm">{[property?.address, property?.suburb].filter(Boolean).join(", ")}</p>
        <p className="text-white/80 text-sm mt-2">{finishedTime}</p>
        <p className="text-white/70 text-sm">Cleaned by {cleanerNames}</p>
        <button
          onClick={() => window.print()}
          className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold print:hidden"
          aria-label="Print or save as PDF"
        >
          <Printer className="w-3.5 h-3.5" /> Print / PDF
        </button>
      </div>

      {/* Summary strip */}
      <div className="flex gap-2 px-4 -mt-3 overflow-x-auto pb-1">
        <div className="flex-1 min-w-[100px] bg-card border border-border rounded-xl px-3 py-2.5 text-center shadow-sm">
          <span className="text-lg">{allComplete ? "✓" : `${completedItems}/${totalItems}`}</span>
          <p className="text-[11px] text-muted-foreground mt-0.5">{allComplete ? "All rooms complete" : "Rooms checked"}</p>
        </div>
        {durationText && (
          <div className="flex-1 min-w-[100px] bg-card border border-border rounded-xl px-3 py-2.5 text-center shadow-sm">
            <span className="text-lg">⏱</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">{durationText}</p>
          </div>
        )}
        {photos.length > 0 && (
          <div className="flex-1 min-w-[100px] bg-card border border-border rounded-xl px-3 py-2.5 text-center shadow-sm">
            <span className="text-lg">📸</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">{photos.length} photo{photos.length !== 1 ? "s" : ""}</p>
          </div>
        )}
        {audit?.percentage != null && (
          <div className="flex-1 min-w-[100px] bg-card border border-border rounded-xl px-3 py-2.5 text-center shadow-sm">
            <span className={`text-lg font-extrabold ${audit.percentage >= 80 ? "text-[#52B788]" : "text-orange-500"}`}>{audit.percentage}%</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">QC score</p>
          </div>
        )}
      </div>

      <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
        {/* Checklist */}
        {totalItems > 0 && (
          <section>
            <h3 className="text-base font-bold text-foreground mb-3">Checklist</h3>
            <div className="space-y-4">
              {Object.entries(roomGroups).map(([room, items]) => (
                <div key={room}>
                  <p className="text-sm font-semibold text-foreground mb-1.5">{room}</p>
                  <div className="space-y-1">
                    {items.map((item: any) => {
                      const done = completionSet.has(item.id);
                      return (
                        <div key={item.id} className="flex items-center gap-2 py-1">
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 text-[#52B788] shrink-0" />
                          ) : (
                            <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className={`text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>{item.task}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Restocking (airbnb only) */}
        {isAirbnb && restockingItems.length > 0 && (
          <section>
            <h3 className="text-base font-bold text-foreground mb-3">Restocking</h3>
            <div className="grid grid-cols-3 gap-2">
              {restockingItems.map((item: any) => {
                const done = restockCompSet.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`relative rounded-xl border p-3 text-center ${done ? "border-[#52B788] bg-[#52B788]/10" : "border-border bg-card"}`}
                  >
                    <span className="text-2xl">{item.emoji || "📦"}</span>
                    <p className="text-[11px] mt-1 text-foreground leading-tight">{item.item_name}</p>
                    {done && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle2 className="h-4 w-4 text-[#52B788]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <section>
            <h3 className="text-base font-bold text-foreground mb-3">Photos</h3>
            {Object.entries(photosByRoom).map(([room, roomPhotos]) => (
              <div key={room} className="mb-3">
                <p className="text-sm font-semibold text-foreground mb-1.5">{room}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {roomPhotos.map((p: any) => (
                    <button key={p.id} onClick={() => setLightboxUrl(p.public_url)} className="aspect-square rounded-lg overflow-hidden">
                      <img src={p.public_url} alt={room} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Cleaner notes */}
        {job.cleaner_notes && (
          <section>
            <h3 className="text-base font-bold text-foreground mb-2">Note from your cleaner 📝</h3>
            <div className="bg-muted rounded-xl p-4">
              <p className="text-sm text-foreground whitespace-pre-wrap">{job.cleaner_notes}</p>
            </div>
          </section>
        )}

        {/* Issues reported during the clean — pulled from
            property_issues. Surfaces broken/damaged/maintenance items
            the cleaner flagged so the client sees them in one place. */}
        {issues.length > 0 && (
          <section>
            <h3 className="text-base font-bold text-foreground mb-2">Issues reported</h3>
            <div className="space-y-2">
              {issues.map((i: any) => (
                <div key={i.id} className="rounded-xl border border-orange-300 bg-orange-50 dark:bg-orange-500/10 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                    <p className="text-sm font-bold text-foreground">{i.room || i.title || "Issue"}</p>
                  </div>
                  {i.description && (
                    <p className="text-sm text-foreground whitespace-pre-wrap mb-2">{i.description}</p>
                  )}
                  {i.photo_url && (
                    <img src={i.photo_url} alt="Issue" className="rounded-lg max-h-40 object-cover" />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Signatures — captured by the cleaner at clock-off (master
            form). Both cleaner_1 and (when 2-cleaner crew) cleaner_2
            sign before the job can be marked complete. */}
        {(signatures.cleaner_1?.signature_data_url || signatures.cleaner_2?.signature_data_url) && (
          <section>
            <h3 className="text-base font-bold text-foreground mb-3">Signed off by</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {signatures.cleaner_1?.signature_data_url && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold mb-2">Cleaner</p>
                  <img
                    src={signatures.cleaner_1.signature_data_url}
                    alt={`Signature of ${signatures.cleaner_1.name}`}
                    className="h-20 object-contain"
                  />
                  <p className="text-sm font-semibold text-foreground mt-1">{signatures.cleaner_1.name}</p>
                </div>
              )}
              {signatures.cleaner_2?.signature_data_url && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-bold mb-2">Second cleaner</p>
                  <img
                    src={signatures.cleaner_2.signature_data_url}
                    alt={`Signature of ${signatures.cleaner_2.name}`}
                    className="h-20 object-contain"
                  />
                  <p className="text-sm font-semibold text-foreground mt-1">{signatures.cleaner_2.name}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center pt-6 pb-10 border-t border-border">
          <p className="text-xs text-muted-foreground">Cleaned and certified by Brightly</p>
          <p className="text-xs text-muted-foreground mt-1">Gold Coast's trusted short-term rental cleaning service</p>
          <a href="https://app.brightly.cleaning" className="text-xs text-[#52B788] font-semibold mt-1 inline-block">app.brightly.cleaning</a>
        </footer>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightboxUrl(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={lightboxUrl} alt="Full size" className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
