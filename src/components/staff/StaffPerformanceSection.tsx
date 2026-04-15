import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Star, CheckCircle, Clock, ClipboardCheck, Camera, XCircle, Loader2 } from 'lucide-react';

interface Props {
  staffId: string;
  staffName: string;
}

export function StaffPerformanceSection({ staffId, staffName }: Props) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['staff-performance', staffId],
    queryFn: async () => {
      // Get jobs where this cleaner was assigned (last 90 days)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status, estimated_duration, scheduled_date')
        .or(`cleaner_1_id.eq.${staffId},cleaner_2_id.eq.${staffId}`)
        .gte('scheduled_date', cutoffStr);

      const allJobs = jobs || [];
      const completed = allJobs.filter(j => j.status === 'completed');
      const cancelled = allJobs.filter(j => j.status === 'cancelled');
      const totalAssigned = allJobs.length;

      // Time entries for avg duration
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('total_minutes, job_id')
        .eq('user_id', staffId)
        .not('total_minutes', 'is', null);

      const avgMinutes = (timeEntries || []).length > 0
        ? (timeEntries || []).reduce((s, t) => s + (t.total_minutes || 0), 0) / (timeEntries || []).length
        : 0;

      // Feedback scores for properties where this cleaner worked
      const jobIds = completed.map(j => j.id);
      let avgRating = 0;
      let feedbackCount = 0;
      if (jobIds.length > 0) {
        const { data: feedback } = await supabase
          .from('job_feedback')
          .select('score')
          .in('job_id', jobIds.slice(0, 100))
          .not('score', 'is', null);
        if (feedback?.length) {
          avgRating = feedback.reduce((s, f) => s + (f.score || 0), 0) / feedback.length;
          feedbackCount = feedback.length;
        }
      }

      // Photos compliance (completed jobs with at least 1 photo)
      let photosCompliance = 0;
      if (completed.length > 0) {
        const { count } = await supabase
          .from('photos')
          .select('job_id', { count: 'exact', head: true })
          .eq('uploaded_by', staffId)
          .in('job_id', completed.map(j => j.id).slice(0, 100));
        photosCompliance = completed.length > 0 ? ((count || 0) / completed.length) * 100 : 0;
      }

      // Job forms (checklist completion)
      let checklistRate = 0;
      if (completed.length > 0) {
        const { count } = await supabase
          .from('job_forms')
          .select('id', { count: 'exact', head: true })
          .eq('cleaner_id', staffId);
        checklistRate = completed.length > 0 ? ((count || 0) / completed.length) * 100 : 0;
      }

      const cancellationRate = totalAssigned > 0 ? (cancelled.length / totalAssigned) * 100 : 0;

      // 30-day completed count
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDayStr = thirtyDaysAgo.toISOString().split('T')[0];
      const completedLast30 = completed.filter(j => j.scheduled_date >= thirtyDayStr).length;

      return {
        avgRating,
        feedbackCount,
        completedTotal: completed.length,
        completedLast30,
        avgMinutes,
        checklistRate: Math.min(checklistRate, 100),
        photosCompliance: Math.min(photosCompliance, 100),
        cancellationRate,
      };
    },
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!metrics) return null;

  const compliance = Math.min((metrics.checklistRate + metrics.photosCompliance) / 2, 100);
  let badge: { label: string; color: string; icon: string } = { label: 'Needs Review', color: 'bg-destructive/10 text-destructive', icon: '⚠️' };
  if (metrics.avgRating >= 4.5 && compliance >= 90) {
    badge = { label: 'Star Cleaner', color: 'bg-accent text-accent-foreground', icon: '⭐' };
  } else if (metrics.avgRating >= 4.0 && compliance >= 80) {
    badge = { label: 'Reliable', color: 'bg-primary/10 text-primary', icon: '✅' };
  }

  const statCards = [
    { icon: Star, label: 'Avg Rating', value: metrics.feedbackCount > 0 ? `${metrics.avgRating.toFixed(1)} / 5` : 'No feedback', sub: `${metrics.feedbackCount} reviews` },
    { icon: CheckCircle, label: 'Jobs Completed', value: `${metrics.completedLast30}`, sub: `last 30 days (${metrics.completedTotal} total)` },
    { icon: Clock, label: 'Avg Duration', value: metrics.avgMinutes > 0 ? `${(metrics.avgMinutes / 60).toFixed(1)}h` : 'N/A', sub: 'per job' },
    { icon: ClipboardCheck, label: 'Checklist Rate', value: `${metrics.checklistRate.toFixed(0)}%`, sub: 'forms submitted' },
    { icon: Camera, label: 'Photo Compliance', value: `${metrics.photosCompliance.toFixed(0)}%`, sub: 'jobs with photos' },
    { icon: XCircle, label: 'Cancellation Rate', value: `${metrics.cancellationRate.toFixed(1)}%`, sub: '' },
  ];

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Performance</h3>
        <Badge className={`${badge.color} text-sm font-bold gap-1`}>{badge.icon} {badge.label}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="bg-muted/50 rounded-xl p-3 text-center">
            <s.icon className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] font-medium text-muted-foreground">{s.label}</p>
            {s.sub && <p className="text-[10px] text-muted-foreground">{s.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Hook for staff list badges
export function useStaffPerformanceBadges(staffIds: string[]) {
  return useQuery({
    queryKey: ['staff-badges', staffIds],
    queryFn: async () => {
      if (!staffIds.length) return {};
      const result: Record<string, { avgRating: number; badge: string; badgeColor: string }> = {};

      // Batch: get all feedback for jobs assigned to these cleaners
      const { data: allJobs } = await supabase
        .from('jobs')
        .select('id, cleaner_1_id, cleaner_2_id, status')
        .eq('status', 'completed')
        .or(staffIds.map(id => `cleaner_1_id.eq.${id},cleaner_2_id.eq.${id}`).join(','));

      const jobsByStaff: Record<string, string[]> = {};
      staffIds.forEach(id => { jobsByStaff[id] = []; });
      (allJobs || []).forEach((j: any) => {
        if (j.cleaner_1_id && jobsByStaff[j.cleaner_1_id]) jobsByStaff[j.cleaner_1_id].push(j.id);
        if (j.cleaner_2_id && jobsByStaff[j.cleaner_2_id]) jobsByStaff[j.cleaner_2_id].push(j.id);
      });

      const allJobIds = [...new Set((allJobs || []).map((j: any) => j.id))];
      const { data: allFeedback } = allJobIds.length
        ? await supabase.from('job_feedback').select('job_id, score').in('job_id', allJobIds.slice(0, 500)).not('score', 'is', null)
        : { data: [] };

      const feedbackByJob: Record<string, number[]> = {};
      (allFeedback || []).forEach((f: any) => {
        if (!feedbackByJob[f.job_id]) feedbackByJob[f.job_id] = [];
        feedbackByJob[f.job_id].push(f.score);
      });

      staffIds.forEach(id => {
        const scores = jobsByStaff[id].flatMap(jid => feedbackByJob[jid] || []);
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        let badge = '⚠️ Needs Review';
        let badgeColor = 'bg-destructive/10 text-destructive';
        if (avg >= 4.5) { badge = '⭐ Star'; badgeColor = 'bg-accent text-accent-foreground'; }
        else if (avg >= 4.0) { badge = '✅ Reliable'; badgeColor = 'bg-primary/10 text-primary'; }
        else if (scores.length === 0) { badge = '—'; badgeColor = 'bg-muted text-muted-foreground'; }
        result[id] = { avgRating: avg, badge, badgeColor };
      });

      return result;
    },
    enabled: staffIds.length > 0,
  });
}
