import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Star, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function TeamPerformance() {
  const { data: rankings = [], isLoading } = useQuery({
    queryKey: ['team-performance-rankings'],
    queryFn: async () => {
      // Get cleaner roles
      const { data: roles } = await supabase.from('user_roles').select('user_id').in('role', ['cleaner', 'head_cleaner']);
      if (!roles?.length) return [];
      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);

      // Get completed jobs this month
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStr = monthStart.toISOString().split('T')[0];

      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, cleaner_1_id, cleaner_2_id')
        .eq('status', 'completed')
        .gte('scheduled_date', monthStr);

      const jobIds = (jobs || []).map(j => j.id);
      const { data: feedback } = jobIds.length
        ? await supabase.from('job_feedback').select('job_id, score').in('job_id', jobIds.slice(0, 500)).not('score', 'is', null)
        : { data: [] };

      const feedbackByJob: Record<string, number> = {};
      (feedback || []).forEach((f: any) => { feedbackByJob[f.job_id] = f.score; });

      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });

      // Calculate per-cleaner
      const cleanerStats: Record<string, { scores: number[]; jobCount: number }> = {};
      ids.forEach(id => { cleanerStats[id] = { scores: [], jobCount: 0 }; });

      (jobs || []).forEach((j: any) => {
        [j.cleaner_1_id, j.cleaner_2_id].filter(Boolean).forEach((cid: string) => {
          if (cleanerStats[cid]) {
            cleanerStats[cid].jobCount++;
            if (feedbackByJob[j.id] != null) cleanerStats[cid].scores.push(feedbackByJob[j.id]);
          }
        });
      });

      return ids.map(id => ({
        id,
        name: nameMap[id] || 'Unknown',
        avgRating: cleanerStats[id].scores.length > 0
          ? cleanerStats[id].scores.reduce((a, b) => a + b, 0) / cleanerStats[id].scores.length
          : null,
        jobCount: cleanerStats[id].jobCount,
      })).sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1));
    },
  });

  if (isLoading) return null;
  if (rankings.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-4">Team Performance</h2>
      <div className="bg-card rounded-2xl shadow-md border border-border overflow-hidden">
        {rankings.map((r, i) => (
          <div key={r.id} className="flex items-center justify-between px-5 py-3 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-muted-foreground w-6">{i + 1}.</span>
              <span className="font-semibold text-foreground">{r.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{r.jobCount} jobs</span>
              {r.avgRating != null ? (
                <Badge className="bg-accent text-accent-foreground gap-1">
                  <Star className="w-3 h-3" /> {r.avgRating.toFixed(1)}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">No ratings</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
