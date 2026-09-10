import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths, differenceInDays,
} from 'date-fns';
import { toast } from 'sonner';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';

const OVERDUE_DAYS = 7;

/** Jobs in these states are not real work and must never count as revenue. */
const DEAD_JOB_STATUSES = ['cancelled'];

/** Raised but not settled. These are the ones Brendan chases. */
const UNPAID_STATUSES = ['draft', 'sent', 'authorised', 'failed'];

const fmt = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

const fmtExact = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

const d = (date: Date) => format(date, 'yyyy-MM-dd');

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What a job is worth, ex GST.
 *
 * This deliberately mirrors the fallback chain in xero-auto-invoice-job, so
 * the revenue shown here is the money that will actually be invoiced. Reading
 * only the job row was wrong: Hostaway-synced and recurring jobs routinely
 * carry no price of their own because the price lives on the property, and
 * those were being reported as "no price" while invoicing billed them fine.
 *
 *   1. the job's own price
 *   2. the linked quote's sell price
 *   3. the property's turnover price (always ex GST)
 *   4. the property's default price (inc or ex, per price_includes_gst)
 *
 * Returns null only when there is genuinely no price anywhere, which is the
 * one case worth showing Brendan.
 */
function jobValueEx(job: any, quotePrices: Record<string, number>): number | null {
  const ex = Number(job.price_ex_gst) || 0;
  if (ex > 0) return ex;

  const inc = Number(job.price_inc_gst) || 0;
  if (inc > 0) return round2(inc / 1.1);

  if (job.linked_quote_id) {
    const q = quotePrices[job.linked_quote_id];
    if (q > 0) return q;
  }

  const prop = job.properties || {};
  const turnover = Number(prop.price_turnover) || 0;
  if (turnover > 0) return turnover;

  const dflt = Number(prop.default_price) || 0;
  if (dflt > 0) return prop.price_includes_gst ? round2(dflt / 1.1) : dflt;

  return null;
}

/** Everything on this page is shown inc GST, which is how the prices are quoted. */
function jobValueInc(job: any, quotePrices: Record<string, number>): number | null {
  const ex = jobValueEx(job, quotePrices);
  return ex === null ? null : round2(ex * 1.1);
}

type Period = { key: string; label: string; from: string; to: string; isFuture: boolean };

function buildPeriods(now: Date): { weeks: Period[]; months: Period[] } {
  // Monday to Sunday, matching the payroll week on the Timesheets page.
  const wk = (offset: number, label: string): Period => {
    const base = offset === 0 ? now : offset < 0 ? subWeeks(now, -offset) : addWeeks(now, offset);
    return {
      key: `week${offset}`,
      label,
      from: d(startOfWeek(base, { weekStartsOn: 1 })),
      to: d(endOfWeek(base, { weekStartsOn: 1 })),
      isFuture: offset > 0,
    };
  };
  const mo = (offset: number, label: string): Period => {
    const base = offset === 0 ? now : offset < 0 ? subMonths(now, -offset) : addMonths(now, offset);
    return {
      key: `month${offset}`,
      label,
      from: d(startOfMonth(base)),
      to: d(endOfMonth(base)),
      isFuture: offset > 0,
    };
  };
  return {
    weeks: [wk(-1, 'Last week'), wk(0, 'This week'), wk(1, 'Next week')],
    months: [mo(-1, 'Last month'), mo(0, 'This month'), mo(1, 'Next month')],
  };
}

function RevenueCard({ period, jobs, quotePrices }: { period: Period; jobs: any[]; quotePrices: Record<string, number> }) {
  const inPeriod = jobs.filter(
    (j) => j.scheduled_date >= period.from && j.scheduled_date <= period.to,
  );
  let total = 0;
  let unpriced = 0;
  inPeriod.forEach((j) => {
    const v = jobValueInc(j, quotePrices);
    if (v === null) unpriced++;
    else total += v;
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {period.label}
      </p>
      <p className="mt-2 text-3xl font-extrabold text-primary">
        {fmt(total)} <span className="text-xs font-bold text-muted-foreground">inc GST</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {format(new Date(period.from + 'T00:00:00'), 'd MMM')} to{' '}
        {format(new Date(period.to + 'T00:00:00'), 'd MMM')}
        {' · '}
        {inPeriod.length} {inPeriod.length === 1 ? 'job' : 'jobs'}
        {period.isFuture ? ' booked' : ''}
      </p>
      {unpriced > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {unpriced} with no price, not counted
        </p>
      )}
    </div>
  );
}

export default function FinancialsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const now = new Date();
  const { weeks, months } = buildPeriods(now);

  // One window wide enough for every card, so the six figures always come from
  // the same snapshot and cannot disagree with each other.
  const rangeFrom = months[0].from < weeks[0].from ? months[0].from : weeks[0].from;
  const rangeTo = months[2].to > weeks[2].to ? months[2].to : weeks[2].to;

  const { data, isLoading } = useQuery({
    queryKey: ['financials-v2', rangeFrom, rangeTo],
    queryFn: async () => {
      const [{ data: periodJobs, error: pErr }, { data: openInvoices, error: iErr }] =
        await Promise.all([
          supabase
            .from('jobs')
            .select('id, scheduled_date, status, price_ex_gst, price_inc_gst, linked_quote_id, properties(property_name, default_price, price_includes_gst, price_turnover)')
            .gte('scheduled_date', rangeFrom)
            .lte('scheduled_date', rangeTo)
            .not('status', 'in', `(${DEAD_JOB_STATUSES.join(',')})`),
          // Unpaid invoices are not limited to the period cards. An invoice
          // from three months ago that never got paid is exactly the one worth
          // seeing, so this query is deliberately unbounded by date.
          supabase
            .from('jobs')
            .select('id, scheduled_date, status, price_ex_gst, price_inc_gst, linked_quote_id, invoice_status, invoice_amount, invoice_sent_at, xero_invoice_id, xero_invoice_number, properties(property_name, default_price, price_includes_gst, price_turnover)')
            .in('invoice_status', UNPAID_STATUSES)
            .not('status', 'in', `(${DEAD_JOB_STATUSES.join(',')})`)
            .order('scheduled_date', { ascending: true }),
        ]);
      if (pErr) throw pErr;
      if (iErr) throw iErr;

      // Only look up quotes for jobs that actually need one, which is usually
      // none of them. Skipping this when the chain already resolved keeps the
      // page to two queries in the common case.
      const needQuote = [...(periodJobs || []), ...(openInvoices || [])]
        .filter((j: any) => j.linked_quote_id && jobValueEx(j, {}) === null)
        .map((j: any) => j.linked_quote_id);

      const quotePrices: Record<string, number> = {};
      if (needQuote.length) {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, sell_price_ex_gst')
          .in('id', [...new Set(needQuote)]);
        (quotes || []).forEach((q: any) => {
          const v = Number(q.sell_price_ex_gst) || 0;
          if (v > 0) quotePrices[q.id] = v;
        });
      }

      // Completed work with no price is money that will never be invoiced
      // unless someone notices, so it gets its own list.
      const missingPrice = (periodJobs || []).filter(
        (j: any) => jobValueInc(j, quotePrices) === null && j.status === 'completed',
      );

      return {
        periodJobs: periodJobs || [],
        openInvoices: openInvoices || [],
        quotePrices,
        missingPrice,
      };
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'paid' | 'voided' }) => {
      const patch =
        status === 'paid'
          ? { invoice_status: 'paid', invoice_paid_at: new Date().toISOString() }
          : { invoice_status: 'voided' };
      const { error } = await supabase.from('jobs').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: ({ id }) => setPendingId(id),
    onSettled: () => setPendingId(null),
    onSuccess: (_r, { status }) => {
      toast.success(status === 'paid' ? 'Marked paid' : 'Marked void');
      queryClient.invalidateQueries({ queryKey: ['financials-v2'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const jobs = data?.periodJobs || [];
  const openInvoices = data?.openInvoices || [];
  const quotePrices = data?.quotePrices || {};
  const missingPrice = data?.missingPrice || [];

  const outstanding = openInvoices.reduce(
    (s: number, j: any) => s + (Number(j.invoice_amount) || jobValueInc(j, quotePrices) || 0),
    0,
  );

  return (
    <div className="space-y-8 p-4 md:p-6">
      <h1 className="text-3xl font-extrabold text-primary">Financials</h1>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          By week
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {weeks.map((p) => <RevenueCard key={p.key} period={p} jobs={jobs} quotePrices={quotePrices} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          By month
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((p) => <RevenueCard key={p.key} period={p} jobs={jobs} quotePrices={quotePrices} />)}
        </div>
      </section>

      {/* ── Unpaid ─────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold text-primary">
            Unpaid invoices ({openInvoices.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            {fmtExact(outstanding)} outstanding
          </p>
        </div>

        {openInvoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing outstanding.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {openInvoices.map((j: any) => {
              const value = Number(j.invoice_amount) || jobValueInc(j, quotePrices);
              const days = j.invoice_sent_at
                ? differenceInDays(Date.now(), new Date(j.invoice_sent_at))
                : null;
              const overdue = j.invoice_status === 'sent' && days !== null && days >= OVERDUE_DAYS;
              const busy = pendingId === j.id;

              return (
                <div key={j.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => navigate(`/jobs/${j.id}`)}
                  >
                    <p className="truncate font-semibold text-foreground">
                      {j.properties?.property_name || 'Unknown property'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {format(new Date(j.scheduled_date + 'T00:00:00'), 'd MMM yyyy')}
                      {j.xero_invoice_number ? ` · ${j.xero_invoice_number}` : ''}
                      {' · '}
                      <span className={overdue ? 'font-bold text-red-400' : ''}>
                        {overdue
                          ? `overdue ${days} days`
                          : (j.invoice_status || 'no invoice')}
                      </span>
                      {value === null && (
                        <span className="font-bold text-amber-400"> · no price set</span>
                      )}
                    </p>
                  </button>

                  <p className="shrink-0 font-bold tabular-nums text-foreground">
                    {value === null ? '—' : fmtExact(value)}
                  </p>

                  <div className="flex shrink-0 gap-2">
                    <button
                      disabled={busy}
                      onClick={() => setStatus.mutate({ id: j.id, status: 'paid' })}
                      className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                    >
                      {busy ? '...' : 'Paid'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setStatus.mutate({ id: j.id, status: 'voided' })}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      Void
                    </button>
                    {j.xero_invoice_id && (
                      <a
                        href={`https://go.xero.com/app/invoicing/edit/${j.xero_invoice_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center rounded-lg border border-border px-2 text-muted-foreground hover:bg-muted"
                        title="Open in Xero"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Paid and Void change Brightly only. Xero is the source of truth and syncs back
          every 15 minutes, so use these for payments recorded outside Xero.
        </p>
      </section>

      {/* ── Missing prices ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-amber-500/30 bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Completed jobs with no price ({missingPrice.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            These are missing from every figure above and cannot be invoiced until priced.
          </p>
        </div>
        {missingPrice.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Every completed job in range has a price.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {missingPrice.map((j: any) => (
              <button
                key={j.id}
                onClick={() => navigate(`/jobs/${j.id}`)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {j.properties?.property_name || 'Unknown property'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(j.scheduled_date + 'T00:00:00'), 'd MMM yyyy')}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-primary">Set price</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
