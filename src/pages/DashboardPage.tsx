import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition } from '@/lib/geo';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useProcessScheduledSms } from '@/hooks/useProcessScheduledSms';
import { TodayJobsWidget } from '@/components/dashboard/TodayJobsWidget';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { JobCard } from '@/components/dashboard/JobCard';
import { CleanerClockCard } from '@/components/cleaner-portal/CleanerClockCard';
import { FounderCommandCentre } from '@/components/dashboard/FounderCommandCentre';

function CleanerClockCardForToday({ jobIds }: { jobIds: string[] }) {
  const { data: jobs = [] } = useQuery({
    queryKey: ['cleaner-clock-card-jobs', jobIds.join(',')],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id,status,scheduled_time,property_id,properties(property_name,address,lat,lng)')
        .in('id', jobIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  return jobIds.length ? <CleanerClockCard todayJobs={jobs as any} /> : null;
}

export default function DashboardPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { jobCards, upcomingJobCards, isLoading, isAdmin } = useDashboardData();
  useProcessScheduledSms();

  const { data: pendingSuggestions = [] } = useQuery({
    queryKey: ['pending-booking-suggestions'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('booking_suggestions' as any).select('id').eq('status', 'pending') as any);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(user && isAdmin),
    refetchInterval: 5 * 60 * 1000,
  });

  const handleStartJob = async (jobId: string) => {
    if (!user) return;
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const position = await getCurrentPosition();
      lat = position.coords.latitude;
      lng = position.coords.longitude;
    } catch {
      // A cleaner may continue when device location is temporarily unavailable.
    }
    const { error } = await supabase.from('time_entries').insert({
      job_id: jobId,
      user_id: user.id,
      clock_in_time: new Date().toISOString(),
      clock_in_lat: lat,
      clock_in_lng: lng,
      geo_override: false,
      geo_distance_meters: null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);
    ['active-time-entry', 'schedule-jobs', 'dashboard-jobs', 'time-entry'].forEach((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }));
    toast.success('Clocked in');
    navigate(`/jobs/${jobId}`);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-lg font-bold text-primary">Loading dashboard…</p></div>;
  }

  if (role === 'cleaner') {
    const upcomingByDate = upcomingJobCards.reduce<Record<string, typeof upcomingJobCards>>((groups, job) => {
      (groups[job.scheduledDate] ??= []).push(job);
      return groups;
    }, {});
    return (
      <div className="mx-auto w-full min-w-0 max-w-lg space-y-6">
        <TodayJobsWidget />
        <DashboardGreeting />
        <CleanerClockCardForToday jobIds={jobCards.map((job) => job.id)} />
        <section>
          <h2 className="mb-4 text-xl font-bold text-primary">Today's jobs</h2>
          {jobCards.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center"><p className="text-lg font-bold text-foreground">No jobs today</p><p className="text-sm text-muted-foreground">Your next assigned clean will appear here.</p></div>
          ) : (
            <div className="space-y-4">{jobCards.map((job) => <JobCard key={job.id} {...job} showStartButton showNavigateButton onClick={() => navigate(`/jobs/${job.id}`)} onStartJob={() => handleStartJob(job.id)} />)}</div>
          )}
        </section>
        {Object.keys(upcomingByDate).length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold text-primary">Coming up</h2>
            <div className="space-y-4">{Object.entries(upcomingByDate).map(([date, jobs]) => <div key={date}><p className="mb-2 text-xs font-bold uppercase text-muted-foreground">{format(new Date(`${date}T00:00:00`), 'EEEE, d MMM')}</p><div className="space-y-2">{jobs.map((job) => <button type="button" key={job.id} onClick={() => navigate(`/jobs/${job.id}`)} className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-foreground">{job.propertyName}</span><span className="block truncate text-xs text-muted-foreground">{job.address}</span></span><span className="shrink-0 text-sm font-bold text-foreground">{job.scheduledTime || 'TBC'}</span></button>)}</div></div>)}</div>
          </section>
        )}
      </div>
    );
  }

  if (role === 'admin' || role === 'head_cleaner') {
    return <FounderCommandCentre firstName={(user?.user_metadata?.full_name || user?.email || '').split(/[ @]/)[0] || undefined} role={role} pendingSuggestionCount={pendingSuggestions.length} />;
  }

  return null;
}
