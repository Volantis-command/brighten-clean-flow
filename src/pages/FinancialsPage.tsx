import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, startOfMonth, startOfQuarter, differenceInDays } from 'date-fns';
import { DollarSign, TrendingUp, FileText, ExternalLink } from 'lucide-react';

const OVERDUE_DAYS = 7;

function InvoiceBadge({ status, sentAt, xeroId }: { status: string | null; sentAt: string | null; xeroId: string | null }) {
  const isOverdue = status === 'sent' && sentAt && differenceInDays(Date.now(), new Date(sentAt)) >= OVERDUE_DAYS;

  if (isOverdue) {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}>OVERDUE</span>;
  }
  switch (status) {
    case 'paid':
      return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ADE80' }}>PAID</span>;
    case 'sent':
      return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(96,165,250,0.15)', color: '#60A5FA' }}>SENT</span>;
    case 'authorised':
      return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#FCD34D' }}>AUTHORISED</span>;
    case 'draft':
      return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: '#94A3B8' }}>DRAFT</span>;
    case 'voided':
    case 'void':
      return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#64748B' }}>VOID</span>;
    default:
      return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#64748B' }}>NO INVOICE</span>;
  }
}

export default function FinancialsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['financials'],
    queryFn: async () => {
      const now = new Date();
      const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const quarterStart = format(startOfQuarter(now), 'yyyy-MM-dd');

      const [weekRes, monthRes, quarterRes, jobsRes, quotesRes] = await Promise.all([
        supabase.from('jobs').select('price_inc_gst').eq('status', 'completed').gte('scheduled_date', weekStart),
        supabase.from('jobs').select('price_inc_gst').eq('status', 'completed').gte('scheduled_date', monthStart),
        supabase.from('jobs').select('price_inc_gst').eq('status', 'completed').gte('scheduled_date', quarterStart),
        supabase.from('jobs')
          .select('id, scheduled_date, price_inc_gst, invoice_status, invoice_amount, xero_invoice_id, xero_invoice_number, invoice_sent_at, invoice_raised_at, properties(property_name)')
          .eq('status', 'completed')
          .order('scheduled_date', { ascending: false })
          .limit(50),
        supabase.from('quotes').select('sell_price_inc_gst, discounted_price, status')
          .in('status', ['quote_sent', 'draft']),
      ]);

      const sum = (rows: any[]) => rows.reduce((s, j) => s + (j.price_inc_gst || 0), 0);
      const invSum = (rows: any[]) => rows.reduce((s, j) => s + (j.invoice_amount || j.price_inc_gst || 0), 0);

      const jobs = jobsRes.data || [];

      const draftJobs   = jobs.filter((j: any) => j.invoice_status === 'draft');
      const sentJobs    = jobs.filter((j: any) => j.invoice_status === 'sent' && j.invoice_sent_at && differenceInDays(Date.now(), new Date(j.invoice_sent_at)) < OVERDUE_DAYS);
      const overdueJobs = jobs.filter((j: any) => j.invoice_status === 'sent' && j.invoice_sent_at && differenceInDays(Date.now(), new Date(j.invoice_sent_at)) >= OVERDUE_DAYS);
      const paidJobs    = jobs.filter((j: any) => j.invoice_status === 'paid');

      const outstandingValue = (quotesRes.data || []).reduce((s: number, q: any) =>
        s + (q.discounted_price || q.sell_price_inc_gst || 0), 0);

      return {
        weekRevenue: sum(weekRes.data || []),
        monthRevenue: sum(monthRes.data || []),
        quarterRevenue: sum(quarterRes.data || []),
        outstandingQuotes: outstandingValue,
        outstandingCount: quotesRes.data?.length || 0,
        recentJobs: jobs,
        invoiceSummary: {
          draft:   { count: draftJobs.length,   amount: invSum(draftJobs) },
          sent:    { count: sentJobs.length,     amount: invSum(sentJobs) },
          overdue: { count: overdueJobs.length,  amount: invSum(overdueJobs) },
          paid:    { count: paidJobs.length,     amount: invSum(paidJobs) },
        },
      };
    },
  });

  const fmt = (n: number) => '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const statCards = [
    { label: 'This Week', value: fmt(data?.weekRevenue || 0), icon: DollarSign },
    { label: 'This Month', value: fmt(data?.monthRevenue || 0), icon: TrendingUp },
    { label: 'This Quarter', value: fmt(data?.quarterRevenue || 0), icon: TrendingUp },
    { label: `Outstanding Quotes (${data?.outstandingCount || 0})`, value: fmt(data?.outstandingQuotes || 0), icon: FileText },
  ];

  const inv = data?.invoiceSummary;
  const invoiceCards = [
    { label: 'Draft',            count: inv?.draft.count   || 0, amount: inv?.draft.amount   || 0, dotColor: '#94A3B8' },
    { label: 'Sent — awaiting',  count: inv?.sent.count    || 0, amount: inv?.sent.amount    || 0, dotColor: '#60A5FA' },
    { label: `Overdue ${OVERDUE_DAYS}+ days`, count: inv?.overdue.count || 0, amount: inv?.overdue.amount || 0, dotColor: '#F87171' },
    { label: 'Paid',             count: inv?.paid.count    || 0, amount: inv?.paid.amount    || 0, dotColor: '#4ADE80' },
  ];

  return (
    <div className="space-y-6 max-w-[900px] mx-auto">
      <h1 className="text-2xl font-extrabold text-[#4ADE80]">Financials</h1>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Revenue stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map((card) => (
              <div key={card.label} className="glass-card p-4 space-y-1.5">
                <div className="flex items-center gap-2" style={{ color: '#4ADE80' }}>
                  <card.icon className="h-5 w-5" />
                </div>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#F0FDF4' }}>{card.value}</p>
                <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.08em', color: '#86EFAC' }}>{card.label}</p>
              </div>
            ))}
          </div>

          {/* Invoice status summary */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: '#FEDB00' }}>Invoice Status</h3>
              <p className="text-[11px] mt-0.5" style={{ color: '#86EFAC' }}>Based on last 50 completed jobs</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {invoiceCards.map((card) => (
                <div key={card.label} className="px-4 py-4 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: card.dotColor }} />
                    <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.07em', color: '#86EFAC' }}>{card.label}</p>
                  </div>
                  <p className="text-xl font-extrabold tabular-nums" style={{ color: '#F0FDF4' }}>{fmt(card.amount)}</p>
                  <p className="text-xs" style={{ color: '#64748B' }}>{card.count} job{card.count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent completed jobs with invoice status */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-sm font-bold" style={{ color: '#FEDB00' }}>Recent Completed Jobs</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-4 py-2 text-left text-xs font-bold" style={{ color: '#86EFAC' }}>Date</th>
                    <th className="px-4 py-2 text-left text-xs font-bold" style={{ color: '#86EFAC' }}>Property</th>
                    <th className="px-4 py-2 text-left text-xs font-bold" style={{ color: '#86EFAC' }}>Invoice</th>
                    <th className="px-4 py-2 text-right text-xs font-bold" style={{ color: '#86EFAC' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentJobs || []).map((j: any) => (
                    <tr key={j.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-2 text-xs whitespace-nowrap" style={{ color: '#F0FDF4' }}>
                        {j.scheduled_date ? format(new Date(j.scheduled_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs truncate max-w-[180px]" style={{ color: '#F0FDF4' }}>
                        {(j as any).properties?.property_name || '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <InvoiceBadge status={j.invoice_status} sentAt={j.invoice_sent_at} xeroId={j.xero_invoice_id} />
                          {j.xero_invoice_number && (
                            <span className="text-[10px]" style={{ color: '#64748B' }}>#{j.xero_invoice_number}</span>
                          )}
                          {j.xero_invoice_id && (
                            <a
                              href={`https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${j.xero_invoice_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="opacity-40 hover:opacity-100 transition-opacity"
                            >
                              <ExternalLink className="h-3 w-3" style={{ color: '#86EFAC' }} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-right font-bold" style={{ color: '#F0FDF4' }}>
                        {j.price_inc_gst ? fmt(j.price_inc_gst) : '—'}
                      </td>
                    </tr>
                  ))}
                  {(data?.recentJobs || []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs" style={{ color: '#86EFAC' }}>No completed jobs yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
