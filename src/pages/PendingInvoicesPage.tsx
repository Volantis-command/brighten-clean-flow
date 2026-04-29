import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle, Clock, FileX, ExternalLink } from 'lucide-react';
import { format, differenceInDays, differenceInMinutes } from 'date-fns';

/**
 * Invoices needing attention — three sections:
 *
 * 1. No Invoice — completed cleans where no invoice has been created yet.
 *    These need a Xero draft raised before you can send/collect.
 *
 * 2. Awaiting Payment — invoices already sent to the client but not yet paid.
 *    Shows all sent invoices. Days since sent shown as context.
 *
 * 3. Drafts in Xero — invoice_status='draft'/'authorised' in Xero.
 *    Brightly created the draft; you authorise + send from Xero.
 */

const STUCK_THRESHOLD_MINUTES = 5;

export default function PendingInvoicesPage() {
  const navigate = useNavigate();

  // 1. Completed jobs with no invoice raised at all
  const { data: uninvoiced = [], isLoading: loadingUninvoiced } = useQuery({
    queryKey: ['uninvoiced-jobs'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, clock_off_at, price_ex_gst, price_inc_gst, properties(property_name, client_name, suburb, address)')
        .eq('status', 'completed')
        .or('invoice_status.is.null,invoice_status.eq.not_raised')
        .lt('clock_off_at', cutoff)
        .order('clock_off_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    refetchInterval: 60_000,
  });

  // 2. Invoices sent but not yet paid (all sent invoices, regardless of age)
  const { data: awaitingPayment = [], isLoading: loadingAwaiting } = useQuery({
    queryKey: ['awaiting-payment-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_inc_gst, invoice_amount, xero_invoice_id, xero_invoice_number, invoice_status, invoice_sent_at, properties(property_name, client_name, suburb)')
        .eq('invoice_status', 'sent')
        .not('invoice_sent_at', 'is', null)
        .order('invoice_sent_at', { ascending: true });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  // 3. Stuck drafts — raised in Xero but not yet sent
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

  const isLoading = loadingUninvoiced || loadingAwaiting || loadingStuck;
  const totalNeedingAttention = uninvoiced.length + awaitingPayment.length + stuck.length;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">Invoices Needing Attention</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : totalNeedingAttention === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center">
          <p className="text-3xl mb-2">✨</p>
          <p className="font-bold text-foreground">All caught up.</p>
          <p className="text-xs text-muted-foreground mt-1">No uninvoiced cleans, no outstanding invoices.</p>
        </div>
      ) : (
        <>
          {/* ── No invoice raised ── */}
          {uninvoiced.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <FileX className="h-4 w-4 text-orange-500" />
                  No Invoice Created ({uninvoiced.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Completed cleans with no Xero invoice yet. Open the job to create one.
                </p>
              </div>
              {(uninvoiced as any[]).map((job) => {
                const property = job.properties as any;
                const amount = job.price_inc_gst || job.price_ex_gst || 0;
                return (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    className="w-full text-left bg-card rounded-2xl shadow-sm border border-orange-400/40 p-4 hover:border-orange-400/80 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-foreground truncate">{property?.property_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {property?.client_name} · {job.scheduled_date ? format(new Date(job.scheduled_date + 'T00:00:00'), 'MMM d, yyyy') : ''}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {amount > 0
                            ? <span className="text-sm font-bold text-primary">${Number(amount).toFixed(2)}</span>
                            : <span className="text-xs text-muted-foreground italic">No price set</span>}
                          <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">NOT INVOICED</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Awaiting payment ── */}
          {awaitingPayment.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Awaiting Payment ({awaitingPayment.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Invoice sent to client — waiting to be paid.
                </p>
              </div>
              {(awaitingPayment as any[]).map((job) => {
                const property = job.properties as any;
                const amount = job.invoice_amount || job.price_inc_gst || 0;
                const daysSinceSent = job.invoice_sent_at ? differenceInDays(Date.now(), new Date(job.invoice_sent_at)) : 0;
                const isOverdue = daysSinceSent >= 7;
                return (
                  <div
                    key={job.id}
                    className={`bg-card rounded-2xl shadow-sm border p-4 flex items-center justify-between gap-4 ${
                      isOverdue ? 'border-red-400/50' : 'border-blue-400/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground truncate">{property?.property_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {property?.client_name} · sent {job.invoice_sent_at ? format(new Date(job.invoice_sent_at), 'MMM d') : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-primary">${Number(amount).toFixed(2)}</span>
                        {job.xero_invoice_number && <span className="text-xs text-muted-foreground">#{job.xero_invoice_number}</span>}
                        {isOverdue
                          ? <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">{daysSinceSent} DAYS OVERDUE</span>
                          : <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">SENT {daysSinceSent}d AGO</span>
                        }
                      </div>
                    </div>
                    {job.xero_invoice_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 shrink-0"
                        onClick={() => window.open(`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" /> Xero
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Stuck drafts ── */}
          {stuck.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Drafts in Xero ({stuck.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Brightly created the draft — authorise and send from Xero.
                </p>
              </div>
              {(stuck as any[]).map((job) => {
                const property = job.properties as any;
                const amount = job.invoice_amount || job.price_inc_gst || 0;
                return (
                  <div
                    key={job.id}
                    className="bg-card rounded-2xl shadow-sm border border-yellow-400/50 p-4 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground truncate">{property?.property_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {property?.client_name} · {job.scheduled_date ? format(new Date(job.scheduled_date + 'T00:00:00'), 'MMM d, yyyy') : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-primary">${Number(amount).toFixed(2)}</span>
                        {job.xero_invoice_number && <span className="text-xs text-muted-foreground">#{job.xero_invoice_number}</span>}
                        <span className="text-[10px] font-bold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                          {job.invoice_status === 'authorised' ? 'AUTHORISED — NOT SENT' : 'DRAFT'}
                        </span>
                      </div>
                    </div>
                    {job.xero_invoice_id && (
                      <Button
                        className="gap-2 font-bold"
                        onClick={() => window.open(`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" /> Open in Xero
                      </Button>
                    )}
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
