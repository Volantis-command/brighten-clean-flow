import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { format, differenceInDays, differenceInMinutes } from 'date-fns';

/**
 * "Invoices needing attention" —
 *   - Drafts in Xero: invoice_status='draft' (Brendan sends manually
 *     from Xero now — see triggerJobAutoInvoice in src/lib/jobInvoice.ts).
 *     Listed here just so admin has a quick view of which jobs have
 *     drafts waiting + a deep-link into Xero.
 *   - Authorised but not emailed: legacy state from when Brightly
 *     used to auto-send. Surface them so they don't get forgotten.
 *   - Overdue: invoice_status='sent' for >7 days without payment.
 */

const STUCK_THRESHOLD_MINUTES = 5;
const OVERDUE_THRESHOLD_DAYS = 7;

export default function PendingInvoicesPage() {
  const navigate = useNavigate();

  const { data: stuck = [], isLoading: loadingStuck } = useQuery({
    queryKey: ['stuck-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, price_inc_gst, invoice_amount, xero_invoice_id, xero_invoice_number, invoice_status, invoice_raised_at, properties(property_name, client_name, suburb)')
        .in('invoice_status', ['draft', 'authorised'])
        .not('xero_invoice_id', 'is', null)
        .order('invoice_raised_at', { ascending: true });
      // Only surface drafts older than the threshold so a freshly-completed
      // clean isn't immediately flagged. The list is informational now —
      // admin actions happen in Xero.
      const now = Date.now();
      return (data || []).filter((j: any) => {
        if (!j.invoice_raised_at) return true;
        return differenceInMinutes(now, new Date(j.invoice_raised_at)) >= STUCK_THRESHOLD_MINUTES;
      });
    },
    refetchInterval: 60_000,
  });

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

  const isLoading = loadingStuck || loadingOverdue;
  const totalNeedingAttention = stuck.length + overdue.length;

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
          <p className="text-xs text-muted-foreground mt-1">
            Auto-send is handling everything. This page only shows invoices where something went wrong.
          </p>
        </div>
      ) : (
        <>
          {/* ── Stuck drafts ── */}
          {stuck.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  Drafts in Xero
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
                          {job.invoice_status === 'authorised' ? 'AUTHORISED — EMAIL FAILED' : 'DRAFT'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {job.xero_invoice_id && (
                        <Button
                          className="gap-2 font-bold"
                          onClick={() => window.open(`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${job.xero_invoice_id}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" /> Open in Xero
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Overdue sent ── */}
          {overdue.length > 0 && (
            <div className="space-y-2">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  Overdue ({OVERDUE_THRESHOLD_DAYS}+ days unpaid)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sent but not paid. Consider following up with the client.
                </p>
              </div>

              {overdue.map((job: any) => {
                const property = job.properties as any;
                const amount = job.invoice_amount || job.price_inc_gst || 0;
                const daysOverdue = differenceInDays(Date.now(), new Date(job.invoice_sent_at));
                return (
                  <div
                    key={job.id}
                    className="bg-card rounded-2xl shadow-sm border border-blue-400/40 p-4 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground truncate">{property?.property_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {property?.client_name} · sent {format(new Date(job.invoice_sent_at), 'MMM d')}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-primary">${Number(amount).toFixed(2)}</span>
                        {job.xero_invoice_number && <span className="text-xs text-muted-foreground">#{job.xero_invoice_number}</span>}
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
        </>
      )}
    </div>
  );
}
