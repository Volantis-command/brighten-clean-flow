import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Star, TrendingUp, Loader2, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';

type AuditRow = {
  id: string;
  job_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  result: string | null;
  improvement_feedback: string | null;
  positive_feedback: string | null;
  audit_date: string | null;
  created_at: string;
  property_name?: string | null;
};

export default function MyBrightlyScorePage() {
  const { user } = useAuth();

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['my-brightly-score', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Pull jobs the cleaner was assigned to
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, scheduled_date, properties(property_name)')
        .or(`cleaner_1_id.eq.${user!.id},cleaner_2_id.eq.${user!.id}`)
        .order('scheduled_date', { ascending: false })
        .limit(60);

      if (!jobs?.length) return [] as AuditRow[];

      const jobIds = jobs.map((j: any) => j.id);
      const { data: qc } = await supabase
        .from('qc_audits')
        .select(
          'id, job_id, total_score, max_score, percentage, result, improvement_feedback, positive_feedback, audit_date, created_at'
        )
        .in('job_id', jobIds)
        .order('created_at', { ascending: false });

      const jobMap = new Map<string, any>(jobs.map((j: any) => [j.id, j]));
      return ((qc ?? []) as any[]).map((a) => ({
        ...a,
        property_name: jobMap.get(a.job_id)?.properties?.property_name || null,
      })) as AuditRow[];
    },
  });

  const stats = useMemo(() => {
    if (!audits.length) {
      return { avgPercent: 0, starRating: 0, totalAudits: 0, passRate: 0, recent: [] as AuditRow[] };
    }
    const validPct = audits.filter((a) => typeof a.percentage === 'number' && a.percentage !== null);
    const avgPercent =
      validPct.length > 0
        ? validPct.reduce((acc, a) => acc + Number(a.percentage || 0), 0) / validPct.length
        : 0;
    const passes = audits.filter((a) => a.result === 'pass').length;
    const passRate = audits.length > 0 ? Math.round((passes / audits.length) * 100) : 0;
    const starRating = Math.max(0, Math.min(5, avgPercent / 20)); // 100% → 5 stars
    return {
      avgPercent: Math.round(avgPercent),
      starRating: Math.round(starRating * 10) / 10,
      totalAudits: audits.length,
      passRate,
      recent: audits.slice(0, 5),
    };
  }, [audits]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderStars = (score: number) => {
    const filled = Math.round(score);
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-7 w-7 ${i < filled ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`}
      />
    ));
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> My Brightly Score
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your quality rating across recent QC audits.
        </p>
      </div>

      <div className="bg-primary text-primary-foreground rounded-2xl p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-primary-foreground/70">
          Current Score
        </p>
        <p className="text-5xl font-extrabold mt-2">
          {stats.starRating ? stats.starRating.toFixed(1) : '—'}
        </p>
        <div className="flex justify-center gap-1 mt-3">{renderStars(stats.starRating)}</div>
        <p className="text-xs text-primary-foreground/70 mt-3">
          {stats.totalAudits} audits · {stats.passRate}% pass rate · {stats.avgPercent}% average
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl border-2 border-border p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audits</p>
          <p className="text-3xl font-extrabold text-foreground mt-1">{stats.totalAudits}</p>
        </div>
        <div className="bg-card rounded-2xl border-2 border-border p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pass rate
          </p>
          <p className="text-3xl font-extrabold text-foreground mt-1">{stats.passRate}%</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Recent QC Audits
        </h2>
        {stats.recent.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-6 text-center">
            <p className="text-3xl mb-2">⭐</p>
            <p className="text-sm text-muted-foreground">No QC audits yet. Keep cleaning!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.recent.map((a) => {
              const dateStr = a.audit_date
                ? format(new Date(a.audit_date), 'd MMM yyyy')
                : format(new Date(a.created_at), 'd MMM yyyy');
              const propName = a.property_name || 'Property';
              const isFail = a.result === 'fail';
              return (
                <div
                  key={a.id}
                  className="bg-card rounded-2xl border border-border p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-sm truncate">{propName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
                    {a.improvement_feedback && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {a.improvement_feedback}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-2xl font-extrabold ${
                        isFail ? 'text-destructive' : 'text-emerald-600'
                      }`}
                    >
                      {a.percentage != null ? `${Math.round(Number(a.percentage))}%` : '—'}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">
                      {a.result || 'pending'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
