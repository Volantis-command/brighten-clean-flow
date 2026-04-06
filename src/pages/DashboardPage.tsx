import { Bot, AlertTriangle, ClipboardList } from 'lucide-react';
import { TodayJobsWidget } from '@/components/dashboard/TodayJobsWidget';
import { CleanerClockCard } from '@/components/cleaner-portal/CleanerClockCard';

function CleanerClockCardForToday({ jobIds }: { jobIds: string[] }) {
  const { data: jobs = [] } = useQuery({
    queryKey: ['cleaner-clock-card-jobs', jobIds.join(',')],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select(
          'id, status, scheduled_time, property_id, properties(property_name, address, lat, lng)'
        )
        .in('id', jobIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  if (jobIds.length === 0) return null;
  return <CleanerClockCard todayJobs={jobs as any} />;
}
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { JobCard } from '@/components/dashboard/JobCard';
import { LiveStatusStrip } from '@/components/dashboard/LiveStatusStrip';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { TopStatsBar } from '@/components/dashboard/TopStatsBar';
import { TodayAtAGlance } from '@/components/dashboard/TodayAtAGlance';
import { TeamPerformanceTable } from '@/components/dashboard/TeamPerformanceTable';
import { RevenueTrend } from '@/components/dashboard/RevenueTrend';
import { RecentFeedback } from '@/components/dashboard/RecentFeedback';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useLeaveConflictAlerts } from '@/hooks/useCleanerConflicts';
import OperationsDashboard from '@/components/dashboard/OperationsDashboard';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

export default function DashboardPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    jobCards,
    upcomingJobCards,
    clockedInCleaners,
    alerts,
    kpi,
    isLoading,
    isAdmin,
    teamPerformance,
    revenueTrend,
    recentFeedback,
  } = useDashboardData();

  const { data: leaveAlerts = [] } = useLeaveConflictAlerts();

  const { data: pendingOnboarding = [] } = useQuery({
    queryKey: ['pending-staff-onboarding'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_onboarding')
        .select('user_id, full_name, status, submitted_at, admin_reviewed_at')
        .eq('status', 'submitted')
        .is('admin_reviewed_at', null);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const handleStartJob = async (jobId: string) => {
    if (!user) return;
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await getCurrentPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch { /* proceed without GPS */ }

    const { error } = await supabase.from('time_entries').insert({
      job_id: jobId, user_id: user.id,
      clock_in_time: new Date().toISOString(),
      clock_in_lat: lat, clock_in_lng: lng,
      geo_override: false, geo_distance_meters: null,
    });
    if (error) { toast.error(error.message); return; }

    await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);
    queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['time-entry'] });
    toast.success('Clocked in!');
    navigate(`/jobs/${jobId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-primary font-bold text-lg">Loading dashboard…</p>
      </div>
    );
  }

  // Cleaner dashboard
  if (role === 'cleaner') {
    const upcomingByDate: Record<string, typeof upcomingJobCards> = {};
    upcomingJobCards.forEach((j) => {
      if (!upcomingByDate[j.scheduledDate]) upcomingByDate[j.scheduledDate] = [];
      upcomingByDate[j.scheduledDate].push(j);
    });

    return (
      <div className="space-y-6 max-w-lg mx-auto">
        <TodayJobsWidget />
        <DashboardGreeting />
        <CleanerClockCardForToday jobIds={jobCards.map((j) => j.id)} />
        <div>
          <h2 className="text-xl font-bold text-primary mb-4">Today's Jobs</h2>
          {jobCards.length === 0 ? (
            <div className="bg-card rounded-2xl shadow-md p-8 text-center">
              <p className="text-4xl mb-3">🌴</p>
              <p className="text-lg font-bold text-foreground mb-1">No jobs today.</p>
              <p className="text-muted-foreground">Enjoy your day!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobCards.map((job) => (
                <JobCard key={job.id} {...job} showStartButton showNavigateButton
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  onStartJob={() => handleStartJob(job.id)} />
              ))}
            </div>
          )}
        </div>
        {Object.keys(upcomingByDate).length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-primary mb-4">Upcoming</h2>
            <div className="space-y-4">
              {Object.entries(upcomingByDate).map(([dateStr, dateJobs]) => (
                <div key={dateStr}>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-2">
                    {format(new Date(dateStr + 'T00:00:00'), 'EEEE, MMM d')}
                  </p>
                  {dateJobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="w-full text-left bg-card rounded-2xl shadow-sm p-4 mb-2 hover:shadow-md transition-shadow border border-border flex items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm truncate">{job.propertyName}</p>
                        {job.address && <p className="text-xs text-muted-foreground truncate">{job.address}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {job.scheduledTime && <p className="text-sm font-bold text-foreground">{job.scheduledTime}</p>}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          job.status === 'scheduled' ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                        }`}>
                          {job.status === 'scheduled' ? 'Scheduled' : job.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Only admin sees the operations dashboard
  const showOpsDashboard = role === 'admin';

  // Admin / Head Cleaner dashboard
  return (
    <div className="space-y-8">
      <TodayJobsWidget />
      <DashboardGreeting />

      {/* Operations Pipeline — admin only */}
      {showOpsDashboard && <OperationsDashboard />}

      {/* Row 1: Top Stats */}
      <TopStatsBar kpi={kpi} />

      {/* Row 2: Today at a Glance */}
      <TodayAtAGlance
        kpi={kpi}
        clockedInCleaners={clockedInCleaners}
        alerts={alerts}
      />

      {/* Quick Actions */}
      <QuickActions />

      {/* Today's Jobs */}
      <div>
        <h2 className="text-xl font-bold text-primary mb-4">Today's Jobs</h2>
        {jobCards.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-md p-6">
            <p className="text-muted-foreground">No jobs scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobCards.map((job) => (
              <JobCard key={job.id} {...job} onClick={() => navigate(`/jobs/${job.id}`)} />
            ))}
          </div>
        )}
      </div>

      {/* Live Status — only show if cleaners are clocked in */}
      {clockedInCleaners.length > 0 && (
        <LiveStatusStrip clockedInCleaners={clockedInCleaners} />
      )}

      {/* Leave conflict alerts */}
      {leaveAlerts.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-primary mb-4">⚠️ Leave Conflicts</h2>
          <div className="space-y-2">
            {leaveAlerts.map((a, i) => (
              <div key={i} className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3 cursor-pointer hover:bg-destructive/15 transition-colors"
                onClick={() => navigate(`/jobs/${a.jobId}`)}>
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm font-semibold text-foreground">
                  {a.cleanerName} is on leave on {format(parseISO(a.date), 'MMM d')} but assigned to {a.propertyName}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending staff onboarding */}
      {pendingOnboarding.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Staff Onboarding
          </h2>
          <div className="space-y-2">
            {pendingOnboarding.map((s: any) => (
              <div key={s.user_id}
                className="bg-accent/10 border border-accent/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-accent/20 transition-colors"
                onClick={() => navigate('/staff')}>
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-accent shrink-0" />
                  <p className="text-sm font-semibold text-foreground">
                    {s.full_name || 'Staff member'} has submitted their onboarding form — review HR details
                  </p>
                </div>
                <span className="text-xs font-bold text-accent bg-accent/20 px-2 py-0.5 rounded-full">Action Needed</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 3: Team Performance */}
      <TeamPerformanceTable data={teamPerformance} />

      {/* Row 4: Revenue Trend */}
      <RevenueTrend data={revenueTrend} />

      {/* Row 5: Recent Feedback */}
      <RecentFeedback data={recentFeedback} />

    </div>
  );
}
