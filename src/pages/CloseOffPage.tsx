// ============================================================================
// Close off.
//
// Every finished clean that still owes you something, oldest first. Work down
// it and the calendar goes pale behind you. When this list is empty, every
// clean you have ever done is accounted for.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { closeOffJob, jobClosure } from '@/lib/jobClosure';

const money = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

export function useJobsToClose() {
  return useQuery({
    queryKey: ['jobs-to-close'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, status, price_inc_gst, price_ex_gst, invoice_status, invoice_error, xero_invoice_id, xero_invoice_number, closed_off_at, properties(property_name, address)')
        .eq('status', 'completed')
        .is('closed_off_at', null)
        .order('scheduled_date', { ascending: true });
      if (error) throw new Error(`Could not load the close off list: ${error.message}`);
      return (data as any[]) || [];
    },
  });
}

export default function CloseOffPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useJobsToClose();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'none' | 'draft' | 'failed'>('all');

  const counts = useMemo(() => ({
    all: jobs.length,
    none: jobs.filter((j) => !j.invoice_status || j.invoice_status === 'none').length,
    draft: jobs.filter((j) => j.invoice_status === 'draft').length,
    failed: jobs.filter((j) => j.invoice_status === 'failed').length,
  }), [jobs]);

  const shown = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'none') return jobs.filter((j) => !j.invoice_status || j.invoice_status === 'none');
    return jobs.filter((j) => j.invoice_status === filter);
  }, [jobs, filter]);

  const owed = shown.reduce((s, j) => s + (Number(j.price_inc_gst) || Number(j.price_ex_gst) * 1.1 || 0), 0);

  const close = async (job: any, reason: 'invoice_sent' | 'no_invoice_needed') => {
    setBusy(job.id);
    try {
      await closeOffJob(job.id, reason);
      toast.success(`${job.properties?.property_name || 'Clean'} closed off`);
      qc.invalidateQueries({ queryKey: ['jobs-to-close'] });
      qc.invalidateQueries({ queryKey: ['schedule-jobs'] });
      qc.invalidateQueries({ queryKey: ['financials-v2'] });
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  const TABS: { key: typeof filter; label: string; n: number }[] = [
    { key: 'all', label: 'Everything', n: counts.all },
    { key: 'none', label: 'Never invoiced', n: counts.none },
    { key: 'draft', label: 'Draft in Xero', n: counts.draft },
    { key: 'failed', label: 'Failed', n: counts.failed },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-extrabold text-primary">Close off</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Finished cleans that still want something. Tick one off and it goes pale on the calendar.
          Paid is not here on purpose, Xero handles paid.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors ${
              filter === t.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            {t.label} <span className="tabular-nums">({t.n})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-14 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-3 text-lg font-extrabold text-foreground">Nothing to close off</p>
          <p className="mt-1 text-sm text-muted-foreground">Every finished clean is accounted for.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
            <p className="text-sm font-bold text-foreground">{shown.length} {shown.length === 1 ? 'clean' : 'cleans'}</p>
            <p className="text-sm text-muted-foreground">{money(owed)} inc GST across these</p>
          </div>

          <div className="divide-y divide-border">
            {shown.map((job) => {
              const c = jobClosure(job);
              const value = Number(job.price_inc_gst) || (Number(job.price_ex_gst) || 0) * 1.1;
              const working = busy === job.id;
              return (
                <div key={job.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/jobs/${job.id}`)}>
                    <p className="truncate font-semibold text-foreground">
                      {job.properties?.property_name || 'Unknown property'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {format(parseISO(job.scheduled_date), 'd MMM yyyy')}
                      {job.xero_invoice_number ? ` · ${job.xero_invoice_number}` : ''}
                      {' · '}
                      <span className={c.tone === 'bad' ? 'font-bold text-red-400' : 'font-bold text-amber-500'}>
                        {c.tone === 'bad' && <AlertTriangle className="mr-0.5 inline h-3 w-3 align-[-2px]" />}
                        {c.detail}
                      </span>
                    </p>
                  </button>

                  <p className="shrink-0 font-bold tabular-nums text-foreground">
                    {value > 0 ? money(value) : '—'}
                  </p>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {job.xero_invoice_id && (
                      <a
                        href={`https://go.xero.com/app/invoicing/edit/${job.xero_invoice_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Xero
                      </a>
                    )}
                    <button
                      disabled={working}
                      onClick={() => close(job, 'invoice_sent')}
                      className="flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-extrabold text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                    >
                      {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Invoice sent
                    </button>
                    <button
                      disabled={working}
                      onClick={() => close(job, 'no_invoice_needed')}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      <FileText className="h-3.5 w-3.5" /> No invoice
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
