import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { FileText, ExternalLink, Loader2, Plus } from 'lucide-react';
import { InvoiceBadge } from '@/components/InvoiceBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface PropertyInvoicesTabProps {
  propertyId: string;
  /** Show admin-only controls (Xero deep link, totals breakdown). Default true. */
  showAdminTools?: boolean;
}

/**
 * Invoice history for a single property — used by both the admin Property
 * profile page and the client portal property page (with showAdminTools=false).
 *
 * Reads from the jobs table (no separate invoices table); shows any job that
 * has been raised in Xero (xero_invoice_id present), plus a totals strip.
 *
 * Admin view also shows completed cleans with no Xero invoice so Brendan can
 * create one with a single click (price input → xero-auto-invoice-job).
 */
export default function PropertyInvoicesTab({ propertyId, showAdminTools = true }: PropertyInvoicesTabProps) {
  const queryClient = useQueryClient();
  const [pendingPrices, setPendingPrices] = useState<Record<string, string>>({});
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['property-invoices', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, invoice_status, invoice_amount, invoice_sent_at, invoice_paid_at, invoice_raised_at, xero_invoice_id, xero_invoice_number, price_inc_gst, price_ex_gst')
        .eq('property_id', propertyId)
        .not('xero_invoice_id', 'is', null)
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Admin only: completed jobs that have no Xero invoice yet — these are the
  // ones that need a manual "Create Invoice" trigger.
  const { data: uninvoicedJobs = [] } = useQuery({
    queryKey: ['property-uninvoiced-jobs', propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_ex_gst, price_inc_gst')
        .eq('property_id', propertyId)
        .in('status', ['complete', 'completed'])
        .is('xero_invoice_id', null)
        .order('scheduled_date', { ascending: false });
      return data || [];
    },
    enabled: showAdminTools,
  });

  const createInvoice = async (jobId: string) => {
    const priceStr = pendingPrices[jobId] || '';
    const priceEx = parseFloat(priceStr);
    if (!priceStr || isNaN(priceEx) || priceEx <= 0) {
      toast.error('Enter a price (ex GST) before creating the invoice.');
      return;
    }
    setCreatingId(jobId);
    try {
      // First stamp the price onto the job so the edge function can pick it up.
      const { error: updateErr } = await supabase
        .from('jobs')
        .update({ price_ex_gst: priceEx, price_inc_gst: parseFloat((priceEx * 1.1).toFixed(2)) } as any)
        .eq('id', jobId);
      if (updateErr) throw updateErr;

      // Fire the Xero invoice edge function.
      const { data, error } = await supabase.functions.invoke('xero-auto-invoice-job', {
        body: { job_id: jobId },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || 'Invoice creation failed');
      }
      toast.success('Invoice created in Xero as a draft.');
      queryClient.invalidateQueries({ queryKey: ['property-invoices', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['property-uninvoiced-jobs', propertyId] });
    } catch (e: any) {
      toast.error(e.message || 'Could not create invoice — try again.');
    } finally {
      setCreatingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Totals strip
  const sumPaid = invoices
    .filter((i: any) => i.invoice_status === 'paid')
    .reduce((s: number, i: any) => s + Number(i.invoice_amount || i.price_inc_gst || 0), 0);
  const sumOutstanding = invoices
    .filter((i: any) => i.invoice_status === 'sent' || i.invoice_status === 'authorised')
    .reduce((s: number, i: any) => s + Number(i.invoice_amount || i.price_inc_gst || 0), 0);
  const sumDraft = invoices
    .filter((i: any) => i.invoice_status === 'draft')
    .reduce((s: number, i: any) => s + Number(i.invoice_amount || i.price_inc_gst || 0), 0);

  return (
    <div className="space-y-4 mt-4">
      {showAdminTools && invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Paid</p>
            <p className="text-lg font-extrabold text-brightly">${sumPaid.toFixed(0)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Outstanding</p>
            <p className="text-lg font-extrabold text-blue-600">${sumOutstanding.toFixed(0)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Draft</p>
            <p className="text-lg font-extrabold text-yellow-600">${sumDraft.toFixed(0)}</p>
          </div>
        </div>
      )}

      {/* ── Cleans missing invoices (admin only) ── */}
      {showAdminTools && uninvoicedJobs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Cleans without invoices
          </p>
          {uninvoicedJobs.map((job: any) => {
            const existingPrice = job.price_ex_gst ? String(job.price_ex_gst) : '';
            const inputVal = pendingPrices[job.id] ?? existingPrice;
            return (
              <div
                key={job.id}
                className="bg-card rounded-xl border border-dashed border-orange-300 p-3 flex items-center justify-between gap-3 flex-wrap"
              >
                <div>
                  <p className="font-bold text-sm text-foreground">
                    {format(new Date(job.scheduled_date + 'T00:00:00'), 'd MMM yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">No invoice yet</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Price ex GST"
                      value={inputVal}
                      onChange={e => setPendingPrices(p => ({ ...p, [job.id]: e.target.value }))}
                      className="h-8 text-sm pl-6 rounded-lg"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8"
                    disabled={creatingId === job.id}
                    onClick={() => createInvoice(job.id)}
                  >
                    {creatingId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Create Invoice
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Raised invoices ── */}
      {invoices.length === 0 && uninvoicedJobs.length === 0 && (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="font-bold text-foreground">No invoices yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Invoices appear here once a clean is completed and raised in Xero.
          </p>
        </div>
      )}

      {invoices.length === 0 && uninvoicedJobs.length > 0 && !showAdminTools && (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="font-bold text-foreground">No invoices yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Invoices appear here once a clean is completed and raised in Xero.
          </p>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="space-y-2">
          {invoices.map((inv: any) => {
            const amount = inv.invoice_amount || inv.price_inc_gst || inv.price_ex_gst || 0;
            const dateLabel = inv.scheduled_date
              ? format(new Date(inv.scheduled_date + 'T00:00:00'), 'd MMM yyyy')
              : '—';
            const subLabel = inv.invoice_status === 'paid' && inv.invoice_paid_at
              ? `Paid ${format(new Date(inv.invoice_paid_at), 'd MMM')}`
              : inv.invoice_status === 'sent' && inv.invoice_sent_at
                ? `Sent ${format(new Date(inv.invoice_sent_at), 'd MMM')}`
                : inv.invoice_status === 'draft'
                  ? 'Awaiting send'
                  : '';

            return (
              <div
                key={inv.id}
                className="bg-card rounded-xl border border-border p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground">{dateLabel}</span>
                    {inv.xero_invoice_number && (
                      <span className="text-xs text-muted-foreground">#{inv.xero_invoice_number}</span>
                    )}
                  </div>
                  {subLabel && <p className="text-xs text-muted-foreground mt-0.5">{subLabel}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-sm text-foreground">${Number(amount).toFixed(2)}</span>
                  <InvoiceBadge status={inv.invoice_status} />
                  {showAdminTools && inv.xero_invoice_id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        window.open(
                          `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${inv.xero_invoice_id}`,
                          '_blank'
                        )
                      }
                      title="Open in Xero"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
