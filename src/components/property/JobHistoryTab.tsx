import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Star, CalendarDays, User, DollarSign } from 'lucide-react';

interface Props {
  propertyId: string;
}

export function JobHistoryTab({ propertyId }: Props) {
  const navigate = useNavigate();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['property-job-history', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, notes, price_ex_gst, cleaner_1_id, cleaner_2_id, feedback_score, series_id')
        .eq('property_id', propertyId)
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Get cleaner names
  const cleanerIds = [...new Set(jobs.flatMap(j => [j.cleaner_1_id, j.cleaner_2_id].filter(Boolean)))];
  const { data: cleaners = [] } = useQuery({
    queryKey: ['property-job-cleaners', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  // Get feedback scores
  const jobIds = jobs.map(j => j.id);
  const { data: feedback = [] } = useQuery({
    queryKey: ['property-job-feedback', propertyId],
    queryFn: async () => {
      if (jobIds.length === 0) return [];
      const { data } = await supabase
        .from('job_feedback')
        .select('job_id, score')
        .in('job_id', jobIds);
      return data || [];
    },
    enabled: jobIds.length > 0,
  });

  const cleanerMap: Record<string, string> = {};
  cleaners.forEach((c: any) => { cleanerMap[c.id] = c.full_name || 'Unknown'; });

  const feedbackMap: Record<string, number> = {};
  feedback.forEach((f: any) => { if (f.score) feedbackMap[f.job_id] = f.score; });

  const completedJobs = jobs.filter(j => j.status === 'complete' || j.status === 'completed');
  const ratings = Object.values(feedbackMap);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  const statusLabel = (s: string) => {
    const map: Record<string, { label: string; className: string }> = {
      complete: { label: 'Completed', className: 'bg-primary/10 text-primary' },
      completed: { label: 'Completed', className: 'bg-primary/10 text-primary' },
      scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
      in_progress: { label: 'In Progress', className: 'bg-accent/20 text-accent-foreground' },
      cancelled: { label: 'Cancelled', className: 'bg-destructive/10 text-destructive' },
    };
    return map[s] || { label: s, className: 'bg-muted text-muted-foreground' };
  };

  if (isLoading) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Loading job history…</p>;
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-extrabold text-primary">{jobs.length}</p>
          <p className="text-xs text-muted-foreground font-medium">Total Jobs</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-extrabold text-primary">{completedJobs.length}</p>
          <p className="text-xs text-muted-foreground font-medium">Completed</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <p className="text-2xl font-extrabold text-primary flex items-center justify-center gap-1">
            {avgRating > 0 ? (
              <>
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {avgRating.toFixed(1)}
              </>
            ) : '—'}
          </p>
          <p className="text-xs text-muted-foreground font-medium">Avg Rating</p>
        </div>
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No jobs recorded for this property yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const si = statusLabel(job.status);
            const rating = feedbackMap[job.id];
            const cleanerName = job.cleaner_1_id ? cleanerMap[job.cleaner_1_id] : null;
            const serviceType = job.notes?.split(' — ')[0] || job.notes?.split('\n')[0] || 'Clean';

            return (
              <Card
                key={job.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/jobs/${job.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-bold text-foreground">
                          {format(new Date(job.scheduled_date + 'T00:00:00'), 'd MMM yyyy')}
                        </span>
                        {job.scheduled_time && (
                          <span className="text-xs text-muted-foreground">{job.scheduled_time.slice(0, 5)}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{serviceType}</p>
                      {cleanerName && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{cleanerName}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${si.className}`}>
                        {si.label}
                      </span>
                      {rating && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`}
                            />
                          ))}
                        </div>
                      )}
                      {job.price_ex_gst && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          ${Number(job.price_ex_gst).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
