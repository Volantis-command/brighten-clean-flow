import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Download, Star, MessageSquare, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RateCleanStars from './RateCleanStars';
// TipCleanerButton temporarily removed from UI per Brendan 2026-04-27.
// The component + edge function (create-tip-checkout) + cleaner_tips
// table are still in place — bring back by re-adding the import + the
// JSX block in the rating row below.

interface CleanFormsArchiveProps {
  // Token enables the rating CTA inside the expanded panel.
  token?: string;
  propertyId: string;
  completedJobs: any[];
  cleanerProfiles: any[];
  audits: any[];
  // job_id → 1-10 score from job_feedback
  scoreByJob: Record<string, number>;
}

function scoreToStars(score: number | null | undefined): number {
  if (!score) return 0;
  return Math.max(1, Math.min(5, Math.round(score / 2)));
}

export default function CleanFormsArchive({
  token,
  propertyId,
  completedJobs,
  cleanerProfiles,
  audits,
  scoreByJob,
}: CleanFormsArchiveProps) {
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Filter by date range. Both bounds inclusive; either can be empty.
  const filtered = useMemo(() => {
    return completedJobs.filter((j: any) => {
      if (fromDate && j.scheduled_date < fromDate) return false;
      if (toDate && j.scheduled_date > toDate) return false;
      return true;
    });
  }, [completedJobs, fromDate, toDate]);

  // Fetch comments alongside scores so the archive can show what the
  // client wrote, not just the rating.
  const { data: feedbackByJob = {} } = useQuery({
    queryKey: ['archive-feedback', propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('job_id, comments')
        .eq('property_id', propertyId)
        .not('comments', 'is', null);
      const map: Record<string, string> = {};
      (data || []).forEach((f: any) => { if (f.comments) map[f.job_id] = f.comments; });
      return map;
    },
    enabled: !!propertyId,
  });

  const cleanerName = (id: string | null) => {
    if (!id) return null;
    const p = cleanerProfiles.find((c: any) => c.id === id);
    return p?.full_name?.split(' ')[0] || null;
  };

  // Open the in-app /report/:report_token page (mobile-friendly, fully
  // styled, includes photos + checklist + completion form + signatures).
  // The legacy edge function returned raw HTML that browsers sometimes
  // rendered as plain text and was missing the bulk of the cleaner's
  // submitted data. The user can use the browser's "Print to PDF" from
  // the report page if they need a file.
  const openReport = (job: any) => {
    if (!job.report_token) {
      // Older jobs predate the report_token column. Fall back to the
      // legacy edge function so the button still does something rather
      // than silently failing.
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-clean-report?job_id=${job.id}${tokenParam}`;
      window.open(url, '_blank');
      return;
    }
    window.open(`/report/${job.report_token}`, '_blank');
  };

  const clearFilters = () => { setFromDate(''); setToDate(''); };
  const hasFilters = !!(fromDate || toDate);

  return (
    <div className="space-y-3">
      {/* Date filter */}
      <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-2">
        <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground uppercase tracking-wide">
          <Search className="w-3.5 h-3.5" /> Search by date
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-[1fr,1fr,auto] gap-2 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">From</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 text-sm"
            />
          </div>
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="gap-1 h-10 col-span-2 sm:col-span-1">
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {completedJobs.length} completed clean{completedJobs.length === 1 ? '' : 's'}
      </p>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {hasFilters ? 'No cleans in this date range.' : 'No completed cleans yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((job: any) => {
            const audit = audits.find((a: any) => a.job_id === job.id);
            const score = scoreByJob[job.id];
            const stars = scoreToStars(score);
            const isOpen = openJobId === job.id;
            const cName = cleanerName(job.cleaner_1_id);
            const comments = feedbackByJob[job.id];
            return (
              <div key={job.id} className={`rounded-xl border ${isOpen ? 'border-primary' : 'border-border'} overflow-hidden`}>
                <button
                  onClick={() => setOpenJobId(isOpen ? null : job.id)}
                  className="w-full text-left p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground">
                        {format(new Date(job.scheduled_date + 'T00:00:00'), 'EEE, dd MMM yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cName ? `Cleaner: ${cName}` : 'Cleaner unassigned'}
                        {audit && ` · QC ${audit.percentage}%`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {stars > 0 && (
                        <div className="flex items-center gap-0.5">
                          {[1,2,3,4,5].map((n) => (
                            <Star
                              key={n}
                              className={`w-3.5 h-3.5 ${n <= stars ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-muted-foreground/30'}`}
                            />
                          ))}
                        </div>
                      )}
                      {/* Inline PDF button — Brendan asked for the PDF
                          link directly on the row so a client can grab a
                          report without expanding first. The full
                          report (incl. print stylesheet) lives at
                          /report/:report_token. */}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="View / print clean report"
                        onClick={(e) => { e.stopPropagation(); openReport(job); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            openReport(job);
                          }
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-muted/10 p-3 space-y-3">
                    {comments && (
                      <div className="rounded-lg bg-card border border-border p-3">
                        <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
                          <MessageSquare className="w-3 h-3" /> Your feedback
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-line">{comments}</p>
                      </div>
                    )}

                    {/* Photos live in the clean report (PDF link
                        above + the bottom button). Showing them in the
                        archive too was duplication — Brendan
                        2026-04-28: "they are in the form, so no need
                        to be here as well". */}

                    {token && (
                      <div className="rounded-lg bg-card border border-border p-3">
                        <RateCleanStars
                          token={token}
                          jobId={job.id}
                          existingScore={scoreByJob[job.id] || null}
                        />
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openReport(job)}
                    >
                      <Download className="w-4 h-4" /> View / print clean report
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
