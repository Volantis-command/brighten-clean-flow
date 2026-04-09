import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Star } from 'lucide-react';

interface Props {
  staffId: string;
  staffName: string;
}

export default function CleanerScorecard({ staffId, staffName }: Props) {
  const { data: profile } = useQuery({
    queryKey: ['staff-scorecard', staffId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('audit_scores').eq('id', staffId).single();
      return data;
    },
    enabled: !!staffId,
  });

  const scores: number[] = (profile?.audit_scores as number[]) || [];

  if (!scores.length) {
    return (
      <div className="bg-card rounded-2xl shadow-md p-5">
        <h3 className="text-lg font-bold text-foreground mb-2">Performance Scorecard</h3>
        <p className="text-sm text-muted-foreground italic">No audits completed yet</p>
      </div>
    );
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const totalAudits = scores.length;
  const last10 = scores.slice(-10);

  // Trend
  let trend: 'improving' | 'declining' | null = null;
  if (scores.length >= 3) {
    const last3Avg = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
    if (last3Avg > avg + 0.1) trend = 'improving';
    else if (last3Avg < avg - 0.1) trend = 'declining';
  }

  const avgColor = avg >= 4 ? 'text-amber-500' : avg >= 3 ? 'text-amber-600' : 'text-destructive';

  const barColor = (s: number) => {
    if (s >= 4) return 'bg-brightly';
    if (s >= 3) return 'bg-amber-500';
    return 'bg-destructive';
  };

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <h3 className="text-lg font-bold text-foreground">Performance Scorecard</h3>

      <div className="flex items-center gap-4">
        {/* Average score with stars */}
        <div className="flex items-center gap-2">
          <span className={`text-3xl font-extrabold ${avgColor}`}>{avg.toFixed(1)}</span>
          <span className="text-lg text-muted-foreground">/ 5</span>
        </div>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const fill = avg >= n ? 1 : avg >= n - 0.5 ? 0.5 : 0;
            return (
              <Star
                key={n}
                className={`h-5 w-5 ${fill >= 1 ? 'text-amber-400 fill-amber-400' : fill >= 0.5 ? 'text-amber-400 fill-amber-400/50' : 'text-muted-foreground/30'}`}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">{totalAudits} audit{totalAudits !== 1 ? 's' : ''}</span>
        {trend === 'improving' && (
          <span className="text-brightly font-bold">↑ Improving</span>
        )}
        {trend === 'declining' && (
          <span className="text-amber-600 font-bold">↓ Declining</span>
        )}
      </div>

      {/* Bar chart */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Last {last10.length} Scores</p>
        <div className="flex items-end gap-1 h-10">
          {last10.map((s, i) => (
            <div
              key={i}
              className={`rounded-sm ${barColor(s)}`}
              style={{ width: 16, height: `${(s / 5) * 100}%`, minHeight: 4 }}
              title={`Score: ${s}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
