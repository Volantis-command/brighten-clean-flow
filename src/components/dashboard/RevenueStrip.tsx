import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp } from 'lucide-react';
import { startOfWeek, startOfMonth, startOfYear } from 'date-fns';

/**
 * Three revenue figures side by side: this week / this month / this year.
 * All based on jobs where invoice_status = 'paid' and invoice_paid_at
 * falls in the respective window. Taps to the Financials page.
 */
export function RevenueStrip() {
  const navigate = useNavigate();
  const now = new Date();

  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  const monthStart = startOfMonth(now).toISOString();
  const yearStart = startOfYear(now).toISOString();

  const { data: revenue = { week: 0, month: 0, year: 0 } } = useQuery({
    queryKey: ['revenue-strip'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('invoice_amount, price_inc_gst, invoice_paid_at')
        .eq('invoice_status', 'paid')
        .gte('invoice_paid_at', yearStart);

      const rows = data || [];
      const sum = (from: string) =>
        rows
          .filter((r: any) => r.invoice_paid_at && r.invoice_paid_at >= from)
          .reduce((s: number, r: any) => s + Number(r.invoice_amount || r.price_inc_gst || 0), 0);

      return {
        week: sum(weekStart),
        month: sum(monthStart),
        year: sum(yearStart),
      };
    },
    refetchInterval: 120_000,
  });

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toFixed(0)}`;

  const periods = [
    { label: 'This Week', value: revenue.week },
    { label: 'This Month', value: revenue.month },
    { label: 'This Year', value: revenue.year },
  ];

  return (
    <button
      onClick={() => navigate('/financials')}
      className="w-full bg-card rounded-2xl border border-border p-4 hover:border-primary/40 transition-colors text-left"
    >
      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Revenue</span>
        <span className="ml-auto text-[10px] text-muted-foreground">inc GST · tap for detail →</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-border">
        {periods.map((p) => (
          <div key={p.label} className="px-3 first:pl-0 last:pr-0 text-center">
            <p className="text-lg font-extrabold text-foreground">{fmt(p.value)}</p>
            <p className="text-[10px] text-muted-foreground font-medium">{p.label}</p>
          </div>
        ))}
      </div>
    </button>
  );
}
