import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface RevenueTrendProps {
  data: { month: string; revenue: number }[];
}

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function RevenueTrend({ data }: RevenueTrendProps) {
  if (!data.length) return null;

  const maxRevenue = Math.max(...data.map(d => d.revenue));

  return (
    <div>
      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Revenue Trend — Last 6 Months</h2>
      <div className="bg-card rounded-2xl shadow-sm border border-border p-5">
        {maxRevenue === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No revenue data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                formatter={(value: number) => [fmt$(value), 'Revenue']}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={48}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === data.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.4)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
