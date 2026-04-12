import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, startOfMonth, startOfQuarter } from 'date-fns';
import { DollarSign, TrendingUp, FileText, Users } from 'lucide-react';

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
        supabase.from('jobs').select('price_inc_gst').in('status', ['completed', 'complete']).gte('scheduled_date', weekStart),
        supabase.from('jobs').select('price_inc_gst').in('status', ['completed', 'complete']).gte('scheduled_date', monthStart),
        supabase.from('jobs').select('price_inc_gst').in('status', ['completed', 'complete']).gte('scheduled_date', quarterStart),
        supabase.from('jobs').select('id, scheduled_date, price_inc_gst, status, notes, property_id, properties(property_name)')
          .in('status', ['completed', 'complete']).order('scheduled_date', { ascending: false }).limit(50),
        supabase.from('quotes').select('sell_price_inc_gst, discounted_price, status')
          .in('status', ['quote_sent', 'draft']),
      ]);

      const sum = (rows: any[]) => rows.reduce((s, j) => s + (j.price_inc_gst || 0), 0);

      const outstandingValue = (quotesRes.data || []).reduce((s: number, q: any) =>
        s + (q.discounted_price || q.sell_price_inc_gst || 0), 0);

      return {
        weekRevenue: sum(weekRes.data || []),
        monthRevenue: sum(monthRes.data || []),
        quarterRevenue: sum(quarterRes.data || []),
        outstandingQuotes: outstandingValue,
        outstandingCount: quotesRes.data?.length || 0,
        recentJobs: jobsRes.data || [],
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

  return (
    <div className="space-y-6 max-w-[900px] mx-auto">
      <h1 className="text-2xl font-extrabold text-[#3A7560]">Financials</h1>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map((card) => (
              <div key={card.label} className="glass-card p-4 space-y-1.5">
                <div className="flex items-center gap-2" style={{ color: '#3A7560' }}>
                  <card.icon className="h-5 w-5" />
                </div>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#F0FDF4' }}>{card.value}</p>
                <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.08em', color: '#86EFAC' }}>{card.label}</p>
              </div>
            ))}
          </div>

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
                    <th className="px-4 py-2 text-right text-xs font-bold" style={{ color: '#86EFAC' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentJobs || []).map((j: any) => (
                    <tr key={j.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-2 text-xs" style={{ color: '#F0FDF4' }}>
                        {j.scheduled_date ? format(new Date(j.scheduled_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs truncate max-w-[200px]" style={{ color: '#F0FDF4' }}>
                        {(j as any).properties?.property_name || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-right font-bold" style={{ color: '#F0FDF4' }}>
                        {j.price_inc_gst ? fmt(j.price_inc_gst) : '—'}
                      </td>
                    </tr>
                  ))}
                  {(data?.recentJobs || []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-xs" style={{ color: '#86EFAC' }}>No completed jobs yet</td>
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
