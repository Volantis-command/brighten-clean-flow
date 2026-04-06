import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { TrendingUp, Loader2, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';

/** Animated circular score ring per Section 7 spec */
function BrightlyScoreRing({ scorePct, label }: { scorePct: number; label: string }) {
  const radius = 44;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setProgress(scorePct), 80);
    return () => clearTimeout(t);
  }, [scorePct]);

  const offset = circumference - (progress / 100) * circumference;
  const size = (radius + strokeWidth) * 2;

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="brightly-score-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEDB00" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.10)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#brightly-score-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p
          className="tabular-nums leading-none"
          style={{ fontSize: '24px', fontWeight: 800, color: '#F0FDF4' }}
        >
          {Math.round(progress)}
        </p>
      </div>
      <p
        className="mt-3 text-[11px] font-semibold uppercase"
        style={{ letterSpacing: '0.08em', color: '#86EFAC' }}
      >
        {label}
      </p>
    </div>
  );
}

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
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#FEDB00' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-12">
      <div>
        <h1 className="page-heading flex items-center gap-2">
          <TrendingUp className="h-6 w-6" style={{ color: '#FEDB00' }} /> My Brightly Score
        </h1>
        <p className="text-sm mt-1" style={{ color: '#86EFAC' }}>
          Your quality rating across recent QC audits.
        </p>
      </div>

      <div className="glass-card p-6 flex flex-col items-center text-center hover-lift">
        <p className="section-label mb-4">Current Score</p>
        <BrightlyScoreRing scorePct={stats.avgPercent} label="Brightly Score" />
        <p className="text-xs mt-4" style={{ color: '#86EFAC' }}>
          {stats.totalAudits} audits · {stats.passRate}% pass rate ·{' '}
          {stats.starRating ? stats.starRating.toFixed(1) : '—'} stars
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card hover-lift p-4">
          <p className="section-label">Audits</p>
          <p className="text-3xl font-extrabold tabular-nums mt-1" style={{ color: '#F0FDF4' }}>{stats.totalAudits}</p>
        </div>
        <div className="glass-card hover-lift p-4">
          <p className="section-label">Pass rate</p>
          <p className="text-3xl font-extrabold tabular-nums mt-1" style={{ color: '#F0FDF4' }}>{stats.passRate}%</p>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: '#F0FDF4' }}>
          <ClipboardCheck className="h-5 w-5" /> Recent QC Audits
        </h2>
        {stats.recent.length === 0 ? (
          <div className="glass-card p-6 text-center">
            <p className="text-3xl mb-2">⭐</p>
            <p className="text-sm" style={{ color: '#86EFAC' }}>No QC audits yet. Keep cleaning!</p>
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
                  className="glass-card hover-lift p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: '#F0FDF4' }}>{propName}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#86EFAC' }}>{dateStr}</p>
                    {a.improvement_feedback && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: '#86EFAC', opacity: 0.8 }}>
                        {a.improvement_feedback}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className="text-2xl font-extrabold tabular-nums"
                      style={{ color: isFail ? '#EF4444' : '#22C55E' }}
                    >
                      {a.percentage != null ? `${Math.round(Number(a.percentage))}%` : '—'}
                    </p>
                    <p className="text-[10px] font-bold uppercase" style={{ color: '#86EFAC' }}>
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
