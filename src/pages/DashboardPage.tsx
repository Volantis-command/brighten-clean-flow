import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition } from '@/lib/geo';
import { AlertTriangle, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { TodayJobsWidget } from '@/components/dashboard/TodayJobsWidget';
import { CleanerClockCard } from '@/components/cleaner-portal/CleanerClockCard';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { JobCard } from '@/components/dashboard/JobCard';
import { LiveStatusStrip } from '@/components/dashboard/LiveStatusStrip';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { CommandPulse } from '@/components/dashboard/CommandPulse';
import { RevenueStrip } from '@/components/dashboard/RevenueStrip';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { TeamPerformanceTable } from '@/components/dashboard/TeamPerformanceTable';
import { RevenueTrend } from '@/components/dashboard/RevenueTrend';
import { RecentFeedback } from '@/components/dashboard/RecentFeedback';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useLeaveConflictAlerts } from '@/hooks/useCleanerConflicts';
import OperationsDashboard from '@/components/dashboard/OperationsDashboard';
import { useProcessScheduledSms } from '@/hooks/useProcessScheduledSms';
import SendQuoteLinkModal from '@/components/dashboard/SendQuoteLinkModal';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

function CleanerClockCardForToday({ jobIds }: { jobIds: string[] }) {
  const { data: jobs = [] } = useQuery({
    queryKey: ['cleaner-clock-card-jobs', jobIds.join(',')],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, status, scheduled_time, property_id, properties(property_name, address, lat, lng)')
        .in('id', jobIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  if (jobIds.length === 0) return null;
  return <CleanerClockCard todayJobs={jobs as any} />;
}

/** Collapsible section wrapper for secondary content */
function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-1 group"
      >
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
          {title}
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && children}
    </div>
  );
}

export default function DashboardPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    jobCards,
    upcomingJobCards,
    clockedInCleaners,
    isLoading,
    isAdmin,
    teamPerformance,
    revenueTrend,
    recentFeedback,
  } = useDashboardData();

  useProcessScheduledSms();

  // Pending iCal booking suggestions — drives the top-of-dashboard alert banner
  const { data: pendingSuggestions = [] } = useQuery({
    queryKey: ['pending-booking-suggestions'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('booking_suggestions' as any).select('id').eq('status', 'pending') as any);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && isAdmin,
    refetchInterval: 5 * 60 * 1000,
  });
  const pendingCount = pendingSuggestions.length;

  const { data: leaveAlerts = [] } = useLeaveConflictAlerts();

  const [sendQuoteOpen, setSendQuoteOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);

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

  /* ── Cleaner dashboard ───────────────────────────────────────────── */
  if (role === 'cleaner') {
    const upcomingByDate: Record<string, typeof upcomingJobCards> = {};
    upcomingJobCards.forEach((j) => {
      if (!upcomingByDate[j.scheduledDate]) upcomingByDate[j.scheduledDate] = [];
      upcomingByDate[j.scheduledDate].push(j);
    });

    return (
      <div className="space-y-6 max-w-lg mx-auto overflow-x-hidden w-full max-w-full">
        <TodayJobsWidget />
        <DashboardGreeting />
        <CleanerClockCardForToday jobIds={jobCards.map((j) => j.id)} />
        <div>
          <h2 className="text-xl font-bold mb-4" style={{ color: '#FEDB00' }}>Today's Jobs</h2>
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
                    <button key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                      className="w-full text-left bg-card rounded-2xl shadow-sm p-4 mb-2 hover:shadow-md transition-shadow border border-border flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm truncate">{job.propertyName}</p>
                        {job.address && <p className="text-xs text-muted-foreground truncate">{job.address}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {job.scheduledTime && <p className="text-sm font-bold text-foreground">{job.scheduledTime}</p>}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          job.status === 'scheduled' ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                        }`}>{job.status === 'scheduled' ? 'Scheduled' : job.status}</span>
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

  /* ── Admin / Head Cleaner dashboard ─────────────────────────────── */

  // Group upcoming jobs by date for the upcoming section
  const upcomingByDate: Record<string, typeof upcomingJobCards> = {};
  upcomingJobCards.forEach((j) => {
    if (!upcomingByDate[j.scheduledDate]) upcomingByDate[j.scheduledDate] = [];
    upcomingByDate[j.scheduledDate].push(j);
  });

  return (
    <div className="space-y-6 overflow-x-hidden w-full max-w-full">

      {/* ── Booking approval alert — cannot be missed ─────────────────── */}
      {isAdmin && pendingCount > 0 && (
        <button
          onClick={() => navigate('/bookings/suggestions')}
          className="w-full flex items-center justify-between rounded-2xl px-5 py-4 text-left transition-all duration-200 hover:opacity-90 active:scale-[0.99]"
          style={{ background: '#EA580C', color: '#fff', boxShadow: '0 4px 20px rgba(234,88,12,0.35)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🗓</span>
            <div>
              <p className="font-extrabold text-base leading-tight">
                {pendingCount} booking{pendingCount > 1 ? 's' : ''} need{pendingCount === 1 ? 's' : ''} your approval
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                iCal sync found new cleans — tap to review and schedule
              </p>
            </div>
          </div>
          <span className="text-xl font-bold ml-4">→</span>
        </button>
      )}

      {/* Greeting */}
      <DashboardGreeting />

      {/* Quick Actions — 4 buttons always at the top */}
      <QuickActions
        onSendQuoteSMS={() => setSendQuoteOpen(true)}
      />

      {/* The Pulse — action required tiles */}
      <CommandPulse />

      {/* Revenue — week / month / year */}
      {isAdmin && <RevenueStrip />}

      {/* Today's Cleans */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('/schedule')}
          className="flex items-center gap-2 hover:text-foreground transition-colors group w-full text-left"
        >
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground">
            Today's Cleans
          </span>
          {jobCards.length > 0 && (
            <span className="bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {jobCards.length}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">View schedule →</span>
        </button>
        {jobCards.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-5 text-center">
            <p className="text-2xl mb-1">☀️</p>
            <p className="text-sm text-muted-foreground">No cleans scheduled today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {jobCards.map((job) => (
              <JobCard key={job.id} {...job} onClick={() => navigate(`/jobs/${job.id}`)} />
            ))}
          </div>
        )}
      </div>

      {/* Live cleaner status */}
      {clockedInCleaners.length > 0 && (
        <LiveStatusStrip clockedInCleaners={clockedInCleaners} />
      )}

      {/* Upcoming schedule */}
      {Object.keys(upcomingByDate).length > 0 && (
        <Collapsible title={`Upcoming (${upcomingJobCards.length} cleans)`} defaultOpen={true}>
          <div className="space-y-4">
            {Object.entries(upcomingByDate).slice(0, 7).map(([dateStr, dateJobs]) => (
              <div key={dateStr}>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-2">
                  {format(new Date(dateStr + 'T00:00:00'), 'EEEE, MMM d')}
                </p>
                <div className="space-y-2">
                  {dateJobs.map((job) => (
                    <button key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                      className="w-full text-left bg-card rounded-xl border border-border p-3 hover:border-primary/40 transition-colors flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{job.propertyName}</p>
                        {job.address && <p className="text-xs text-muted-foreground truncate">{job.address}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {job.scheduledTime && <p className="text-sm font-bold text-foreground">{job.scheduledTime}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* Alerts — dismissible with 24-hour localStorage persistence */}
      {isAdmin && <AlertsPanel />}

      {/* Leave conflicts */}
      {leaveAlerts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-0.5">Leave Conflicts</p>
          {leaveAlerts.map((a, i) => (
            <div key={i}
              className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 flex items-start gap-3 cursor-pointer hover:bg-destructive/15 transition-colors"
              onClick={() => navigate(`/jobs/${a.jobId}`)}>
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-foreground">
                {a.cleanerName} is on leave on {format(parseISO(a.date), 'MMM d')} but assigned to {a.propertyName}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Staff onboarding */}
      {pendingOnboarding.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-0.5">Staff Onboarding</p>
          {pendingOnboarding.map((s: any) => (
            <div key={s.user_id}
              className="bg-accent/10 border border-accent/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => navigate('/staff')}>
              <div className="flex items-center gap-3">
                <ClipboardList className="h-5 w-5 text-accent shrink-0" />
                <p className="text-sm font-semibold text-foreground">
                  {s.full_name || 'Staff member'} submitted their onboarding form
                </p>
              </div>
              <span className="text-xs font-bold text-accent bg-accent/20 px-2 py-0.5 rounded-full">Review</span>
            </div>
          ))}
        </div>
      )}

      {/* Operations Pipeline — collapsible, admin only */}
      {role === 'admin' && (
        <Collapsible title="Operations Pipeline">
          <OperationsDashboard />
        </Collapsible>
      )}

      {/* Secondary metrics — collapsible */}
      <Collapsible title="Team Performance">
        <TeamPerformanceTable data={teamPerformance} />
      </Collapsible>

      <Collapsible title="Revenue Trend">
        <RevenueTrend data={revenueTrend} />
      </Collapsible>

      <Collapsible title="Recent Feedback">
        <RecentFeedback data={recentFeedback} />
      </Collapsible>

      {/* Send Quote SMS modal */}
      <SendQuoteLinkModal open={sendQuoteOpen} onOpenChange={setSendQuoteOpen} />

    </div>
  );
}
