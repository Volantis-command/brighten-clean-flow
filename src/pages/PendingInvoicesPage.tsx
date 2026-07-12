import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Loader2, AlertTriangle, Clock, ExternalLink,
  RotateCcw, CheckCircle2, DollarSign, X as XIcon, Edit2,
} from 'lucide-react';
import { format, differenceInDays, differenceInMinutes } from 'date-fns';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type JobUpdate = Database['public']['Tables']['jobs']['Update'];

/**
 * Invoices Needing Attention — Brendan's home base for chasing money.
 *
 * Three sections:
 *
 *  1. MISSED CLEANS  — completed jobs with no xero_invoice_id. These are
 *     the ones the auto-invoice never managed to create (most common cause
 *     historically: Hostaway-synced jobs landing with no price, throwing
 *     "No price set on job", and the error being silently swallowed).
 *     Per-row actions: Retry / Mark Invoiced / Mark Paid / Skip,
 *     plus inline price edit for the no-price case.
 *
 *  2. DRAFTS IN XERO — invoice_status='draft' OR 'authorised', xero_invoice_id
 *     present. Brendan reviews and sends from Xero. Per-row: Open in Xero,
 *     Mark Invoiced (flips to 'sent' without waiting for the 15-min cron),
 *     Mark Paid (override for cash payments).
 *
 *  3. OVERDUE — invoice_status='sent' for >7 days without payment.
 *     Per-row: Mark Paid (cash override).
 *
 * The 15-min xero-sync-invoice-status cron handles the automation path —
 * when a Xero invoice flips paid the job auto-flips paid within 15 min.
 * The manual buttons here are the override path for cash + impatient cases.
 */

const STUCK_THRESHOLD_MINUTES = 5;
const OVERDUE_THRESHOLD_DAYS = 7;

type MissedJob = {
  id: string;
  scheduled_date: string;
  status: string;
  price_ex_gst: number | null;
  price_inc_gst: number | null;
  invoice_error: string | null;
  invoice_status: string | null;
  xero_invoice_id: string | null;
  property_id: string | null;
  properties: { id: string; property_name: string; client_name: string; suburb: string } | null;
};

export default function PendingInvoicesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ──────────────────────────────────────────────────────────────────
  // 1. MISSED CLEANS — completed but no Xero invoice
  // ──────────────────────────────────────────────────────────────────
  const { data: missed = [], isLoading: loadingMissed } = useQuery<MissedJob[]>({
    queryKey: ['missed-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select(
          'id, scheduled_date, status, price_ex_gst, price_inc_gst, invoice_error, invoice_status, xero_invoice_id, property_id, properties(id, property_name, client_name, suburb)'
        )
        .in('status', ['complete', 'completed'])
        .is('xero_invoice_id', null)
        .order('scheduled_date', { ascending: false });

      if (error) {
        console.error('missed-invoices query failed', error);
        return [];
      }

      // Hide jobs admin has explicitly skipped or marked paid out-of-band
      return ((data ?? []) as unknown as MissedJob[]).filter(
        (j) => j.invoice_status !== 'skipped' && j.invoice_status !== 'paid' && j.invoice_status !== 'sent'
      );
    },
    refetchInterval: 60_000,
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. STUCK DRAFTS / AUTHORISED — in Xero, awaiting send-or-sync
  // ──────────────────────────────────────────────────────────────────
  const { data: stuck = [], isLoading: loadingStuck } = useQuery({
    queryKey: ['stuck-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_inc_gst, invoice_amount, xero_invoice_id, xero_invoice_number, invoice_status, invoice_raised_at, properties(property_name, client_name, suburb)')
        .in('invoice_status', ['draft', 'authorised'])
        .not('xero_invoice_id', 'is', null)
        .order('invoice_raised_at', { ascending: true });
      const now = Date.now();
      return (data || []).filter((j: any) => {
        if (!j.invoice_raised_at) return true;
        return differenceInMinutes(now, new Date(j.invoice_raised_at)) >= STUCK_THRESHOLD_MINUTES;
      });
    },
    refetchInterval: 60_000,
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. OVERDUE — sent in Xero, unpaid for 7+ days
  // ──────────────────────────────────────────────────────────────────
  const { data: overdue = [], isLoading: loadingOverdue } = useQuery({
    queryKey: ['overdue-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_inc_gst, invoice_amount, xero_invoice_id, xero_invoice_number, invoice_status, invoice_sent_at, properties(property_name, client_name, suburb)')
        .eq('invoice_status', 'sent')
        .not('invoice_sent_at', 'is', null);
      const cutoff = Date.now() - OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
      return (data || []).filter((j: any) => new Date(j.invoice_sent_at).getTime() < cutoff);
    },
    refetchInterval: 60_000,
  });

  const isLoading = loadingMissed || loadingStuck || loadingOverdue;
  const total = missed.length + stuck.length + overdue.length;

  // ──────────────────────────────────────────────────────────────────
  // Mutations — manual overrides
  // ──────────────────────────────────────────────────────────────────
  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['missed-invoices'] });
    qc.invalidateQueries({ queryKey: ['stuck-invoices'] });
    qc.invalidateQueries({ queryKey: ['overdue-invoices'] });
    qc.invalidateQueries({ queryKey: ['schedule-jobs'] });
    qc.invalidateQueries({ queryKey: ['property-jobs'] });
  };

  const setJobInvoiceStatus = async (
    jobId: string,
    patch: JobUpdate,
    successMsg: string
  ) => {
    const { error } = await supabase.from('jobs').update(patch).eq('id', jobId);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return false;
    }
    toast.success(successMsg);
    refetchAll();
    return true;
  };

  const markInvoiced = (jobId: string) =>
    setJobInvoiceStatus(
      jobId,
      { invoice_status: 'sent', invoice_sent_at: new Date().toISOString(), invoice_error: null },
      'Marked as invoiced'
    );

  const markPaid = (jobId: string) =>
    setJobInvoiceStatus(
      jobId,
      { invoice_status: 'paid', invoice_paid_at: new Date().toISOString(), invoice_error: null },
      'Marked as paid 💸'
    );

  const skipJob = (jobId: string) =>
    setJobInvoiceStatus(
      jobId,
      { invoice_status: 'skipped', invoice_error: null },
      'Skipped — already handled'
    );

  const retryInvoice = async (jobId: string) => {
    toast.loading('Retrying auto-invoice…', { id: `retry-${jobId}` });
    try {
      const { data, error } = await supabase.functions.invoke('xero-auto-invoice-job', {
        body: { job_id: jobId, send_email: false },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Draft created in Xero', { id: `retry-${jobId}` });
      refetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Retry failed', { id: `retry-${jobId}` });
      // Failure is now persisted on the job (xero-auto-invoice-job catch block),
      // so the page will show the error inline on next refetch.
      refetchAll();
    }
  };

  const retryAll = async () => {
    if (missed.length === 0) return;
    if (!confirm(`Retry auto-invoice for all ${missed.length} missed cleans?`)) return;
    toast.loading(`Retrying ${missed.length} jobs…`, { id: 'retry-all' });
    let ok = 0;
    let fail = 0;
    for (const j of missed) {
      try {
        const { data, error } = await supabase.functions.invoke('xero-auto-invoice-job', {
          body: { job_id: j.id, send_email: false },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        ok++;
      } catch {
        fail++;
      }
    }
    toast.success(`Retry done — ${ok} drafted, ${fail} still need attention`, { id: 'retry-all' });
    refetchAll();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">Invoices Needing Attention</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : total === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center">
          <p className="text-3xl mb-2">✨</p>
          <p className="font-bold text-foreground">All caught up.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Every completed clean either has a draft in Xero, has been sent, or has been paid.
          </p>
        </div>
      ) : (
        <>
          {/* ── 1. Missed cleans (the priority list) ─────────────── */}
          {missed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    Missed cleans — never invoiced ({missed.length})
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Completed cleans with no Xero invoice. Most common cause: no price set.
                  </p>
                </div>
                <Button size="sm" onClick={retryAll} className="gap-1 font-bold">
                  <RotateCcw className="h-3.5 w-3.5" /> Retry all
                </Button>
              </div>

              {missed.map((job) => (
                <MissedJobRow
                  key={job.id}
                  job={job}
                  onRetry={() => retryInvoice(job.id)}
                  onMarkInvoiced={() => markInvoiced(job.id)}
                  onMarkPaid={() => markPaid(job.id)}
                  onSkip={() => skipJob(job.id)}
                  onPriceUpdated={refetchAll}
                />
              ))}
            </div>
          )}

          {/* ── 2. Drafts in Xero ─────────────────────────────────── */}
          {stuck.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Drafts in Xero ({stuck.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Brightly creates the draft, you authorise + send from Xero.
                </p>
              </div>

              {stuck.map((job: any) => {
                const property = job.properties as any;
                const amount = job.invoice_amount || job.price_inc_gst || 0;
                return (
                  <div
                    key={job.id}
                    className="bg-card rounded-2xl shadow-sm border border-yellow-400/50 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-foreground truncate">
                          {property?.property_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {property?.client_name} ·{' '}
                          {job.scheduled_date
                            ? format(new Date(job.scheduled_date + 'T00:00:00'), 'MMM d, yyyy')
                            : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-sm font-bold text-primary">
                            ${Number(amount).toFixed(2)}
                          </span>
                          {job.xero_invoice_number && (
                            <span className="text-xs text-muted-foreground">
                              #{job.xero_invoice_number}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                            {job.invoice_status === 'authorised' ? 'AUTHORISED' : 'DRAFT'}
                          </span>
                        </div>
                      </div>
                      {job.xero_invoice_id && (
                        <Button
                          size="sm"
                          className="gap-2 font-bold shrink-0"
                          onClick={() =>
                            window.open(
                              `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`,
                              '_blank'
                            )
                          }
                        >
                          <ExternalLink className="h-4 w-4" /> Open in Xero
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => markInvoiced(job.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark invoiced
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-300" onClick={() => markPaid(job.id)}>
                        <DollarSign className="h-3.5 w-3.5" /> Mark paid
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 3. Overdue ────────────────────────────────────────── */}
          {overdue.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  Overdue ({OVERDUE_THRESHOLD_DAYS}+ days unpaid)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sent but not paid. Follow up with the client, or mark paid if cash.
                </p>
              </div>

              {overdue.map((job: any) => {
                const property = job.properties as any;
                const amount = job.invoice_amount || job.price_inc_gst || 0;
                const daysOverdue = differenceInDays(Date.now(), new Date(job.invoice_sent_at));
                return (
                  <div
                    key={job.id}
                    className="bg-card rounded-2xl shadow-sm border border-blue-400/40 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-foreground truncate">
                          {property?.property_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {property?.client_name} · sent{' '}
                          {format(new Date(job.invoice_sent_at), 'MMM d')}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-sm font-bold text-primary">
                            ${Number(amount).toFixed(2)}
                          </span>
                          {job.xero_invoice_number && (
                            <span className="text-xs text-muted-foreground">
                              #{job.xero_invoice_number}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                            {daysOverdue} DAYS OVERDUE
                          </span>
                        </div>
                      </div>
                      {job.xero_invoice_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 shrink-0"
                          onClick={() =>
                            window.open(
                              `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`,
                              '_blank'
                            )
                          }
                        >
                          <ExternalLink className="h-3 w-3" /> Xero
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-emerald-700 border-emerald-300"
                        onClick={() => markPaid(job.id)}
                      >
                        <DollarSign className="h-3.5 w-3.5" /> Mark paid
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MissedJobRow — its own component because it has inline price-edit state
// ──────────────────────────────────────────────────────────────────────
function MissedJobRow({
  job,
  onRetry,
  onMarkInvoiced,
  onMarkPaid,
  onSkip,
  onPriceUpdated,
}: {
  job: MissedJob;
  onRetry: () => void;
  onMarkInvoiced: () => void;
  onMarkPaid: () => void;
  onSkip: () => void;
  onPriceUpdated: () => void;
}) {
  const property = job.properties;
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(
    job.price_ex_gst != null ? String(job.price_ex_gst) : ''
  );
  const hasPrice = (job.price_ex_gst ?? 0) > 0;
  const reasonLabel =
    job.invoice_error ||
    (!hasPrice ? 'No price set on job' : 'Auto-invoice never ran');

  const savePrice = async () => {
    const parsed = parseFloat(priceInput);
    if (!isFinite(parsed) || parsed <= 0) {
      toast.error('Price must be a positive number');
      return;
    }
    const inc = +(parsed * 1.1).toFixed(2);
    const { error } = await supabase
      .from('jobs')
      .update({ price_ex_gst: parsed, price_inc_gst: inc })
      .eq('id', job.id);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    toast.success('Price updated');
    setEditingPrice(false);
    onPriceUpdated();
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-red-400/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground truncate">
            {property?.property_name || 'Unknown property'}
          </p>
          <p className="text-xs text-muted-foreground">
            {property?.client_name}
            {property?.suburb ? ` · ${property.suburb}` : ''} ·{' '}
            {job.scheduled_date
              ? format(new Date(job.scheduled_date + 'T00:00:00'), 'MMM d, yyyy')
              : ''}
          </p>
          <p className="text-xs text-red-600 mt-1 font-medium">⚠ {reasonLabel}</p>
        </div>
      </div>

      {/* Price row — inline edit */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Price ex GST
        </span>
        {editingPrice ? (
          <>
            <Input
              type="number"
              step="0.01"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="h-8 w-28 text-sm"
              autoFocus
            />
            <Button size="sm" className="h-8" onClick={savePrice}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setEditingPrice(false);
                setPriceInput(job.price_ex_gst != null ? String(job.price_ex_gst) : '');
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className={`text-sm font-bold ${hasPrice ? 'text-primary' : 'text-red-600'}`}>
              {hasPrice ? `$${Number(job.price_ex_gst).toFixed(2)}` : 'NOT SET'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => setEditingPrice(true)}
            >
              <Edit2 className="h-3 w-3" /> Edit
            </Button>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <Button size="sm" disabled={!hasPrice} onClick={onRetry} className="gap-1">
          <RotateCcw className="h-3.5 w-3.5" /> Retry invoice
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={onMarkInvoiced}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark invoiced
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-emerald-700 border-emerald-300"
          onClick={onMarkPaid}
        >
          <DollarSign className="h-3.5 w-3.5" /> Mark paid
        </Button>
        <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={onSkip}>
          <XIcon className="h-3.5 w-3.5" /> Skip
        </Button>
      </div>
    </div>
  );
}
