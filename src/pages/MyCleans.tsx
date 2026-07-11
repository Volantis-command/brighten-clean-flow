import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { MapPin, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CleanJob {
  id: string;
  property_name: string;
  address: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  client_type: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-[rgba(96,165,250,0.15)] text-[#60A5FA] border-0' },
  in_progress: { label: 'In Progress', className: 'bg-[rgba(251,191,36,0.15)] text-[#FCD34D] border-0' },
  completed: { label: 'Completed', className: 'bg-brightly/10 text-brightly border-0' },
};

export default function MyCleans() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['my-cleans', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, property_id, properties(property_name, address, client_type)')
        .or(`cleaner_1_id.eq.${user!.id},cleaner_2_id.eq.${user!.id}`)
        .gte('scheduled_date', today)
        .in('status', ['scheduled', 'in_progress', 'completed'])
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((j: any) => ({
        id: j.id,
        property_name: j.properties?.property_name ?? 'Property',
        address: j.properties?.address ?? null,
        scheduled_date: j.scheduled_date,
        scheduled_time: j.scheduled_time,
        status: j.status,
        client_type: j.properties?.client_type ?? null,
      })) as CleanJob[];
    },
    refetchInterval: 30000,
  });

  const todayJobs = jobs.filter(j => isToday(parseISO(j.scheduled_date)));
  const upcomingJobs = jobs.filter(j => !isToday(parseISO(j.scheduled_date)));

  // Group upcoming by date
  const upcomingByDate: Record<string, CleanJob[]> = {};
  upcomingJobs.forEach(j => {
    if (!upcomingByDate[j.scheduled_date]) upcomingByDate[j.scheduled_date] = [];
    upcomingByDate[j.scheduled_date].push(j);
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
      <h1 className="text-2xl font-extrabold text-foreground">My Cleans</h1>

      {/* Today */}
      <section>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">Today</h2>
        {todayJobs.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center">
            <p className="text-3xl mb-2">🌴</p>
            <p className="font-bold text-foreground">No cleans today</p>
            <p className="text-sm text-muted-foreground">Enjoy your day off!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayJobs.map(job => (
              <JobListCard key={job.id} job={job} onClick={() => navigate(`/clean/${job.id}`)} />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {Object.keys(upcomingByDate).length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">Upcoming</h2>
          <div className="space-y-4">
            {Object.entries(upcomingByDate).map(([dateStr, dateJobs]) => {
              const d = parseISO(dateStr);
              const label = isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE, MMM d');
              return (
                <div key={dateStr}>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-2">{label}</p>
                  <div className="space-y-3">
                    {dateJobs.map(job => (
                      <JobListCard key={job.id} job={job} onClick={() => navigate(`/clean/${job.id}`)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function JobListCard({ job, onClick }: { job: CleanJob; onClick: () => void }) {
  const st = STATUS_CONFIG[job.status] ?? { label: job.status, className: 'bg-muted text-muted-foreground' };
  const serviceLabel = job.client_type === 'airbnb' ? 'Airbnb Turnover' : 'House Clean';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow flex items-center gap-3"
    >
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-bold text-foreground text-base truncate">{job.property_name}</p>
        {job.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" /> {job.address}
          </p>
        )}
        <div className="flex items-center gap-2">
          {job.scheduled_time && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {job.scheduled_time?.slice(0, 5)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">· {serviceLabel}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <Badge className={`${st.className} text-[10px] font-bold`}>{st.label}</Badge>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
    </button>
  );
}
