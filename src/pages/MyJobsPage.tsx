import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MapPin, Clock, ChevronRight, Loader2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Upcoming', className: 'bg-muted text-muted-foreground border-0' },
  confirmed: { label: 'Upcoming', className: 'bg-muted text-muted-foreground border-0' },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-800 border-0' },
  completed: { label: 'Completed', className: 'bg-brightly/10 text-brightly border-0' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-destructive border-0' },
};

export default function MyJobsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['my-jobs-today', user?.id, role],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, estimated_duration, cleaner_1_id, cleaner_2_id, notes, properties(property_name, address, client_type)')
        .eq('scheduled_date', today)
        .in('status', ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'])
        .order('scheduled_time', { ascending: true });

      if (role === 'cleaner' || role === 'head_cleaner') {
        query = query.or(`cleaner_1_id.eq.${user!.id},cleaner_2_id.eq.${user!.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch cleaner profiles for avatar initials
      const cleanerIds = new Set<string>();
      (data ?? []).forEach((j: any) => {
        if (j.cleaner_1_id) cleanerIds.add(j.cleaner_1_id);
        if (j.cleaner_2_id) cleanerIds.add(j.cleaner_2_id);
      });

      let profileMap: Record<string, string> = {};
      if (cleanerIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(cleanerIds));
        (profiles ?? []).forEach((p: any) => {
          profileMap[p.id] = p.full_name || '?';
        });
      }

      return (data ?? []).map((j: any) => ({
        ...j,
        property_name: j.properties?.property_name ?? 'Property',
        address: j.properties?.address ?? null,
        client_type: j.properties?.client_type ?? null,
        cleaners: [j.cleaner_1_id, j.cleaner_2_id]
          .filter(Boolean)
          .map((id: string) => ({ id, name: profileMap[id] || '?' })),
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Today's Jobs</h1>
        <p className="text-sm text-muted-foreground mt-1">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <p className="text-3xl mb-2">🌴</p>
          <p className="font-bold text-foreground">No jobs scheduled for today.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const st = STATUS_CONFIG[job.status] ?? { label: job.status, className: 'bg-muted text-muted-foreground' };
            const serviceLabel = job.client_type === 'airbnb' ? 'Airbnb Turnover' : 'House Clean';
            const durationHrs = job.estimated_duration ? `${(job.estimated_duration / 60).toFixed(1)} hrs` : null;

            return (
              <button
                key={job.id}
                onClick={() => navigate(`/clean/${job.id}`)}
                className="w-full text-left bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {job.scheduled_time && (
                      <p className="text-lg font-extrabold text-foreground">{job.scheduled_time.slice(0, 5)}</p>
                    )}
                    <p className="font-bold text-foreground text-base truncate">{job.property_name}</p>
                    {job.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" /> {job.address}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{serviceLabel}</span>
                      {durationHrs && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {durationHrs}
                        </span>
                      )}
                    </div>
                    {job.cleaners.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {job.cleaners.map((c: any) => (
                          <div
                            key={c.id}
                            className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold"
                            title={c.name}
                          >
                            {c.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge className={`${st.className} text-[10px] font-bold`}>{st.label}</Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
