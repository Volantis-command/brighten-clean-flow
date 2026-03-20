import { Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition } from '@/lib/geo';
import { Button } from '@/components/ui/button';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { JobCard } from '@/components/dashboard/JobCard';
import { TodaySummary } from '@/components/dashboard/TodaySummary';
import { LiveStatusStrip } from '@/components/dashboard/LiveStatusStrip';
import { AlertsSection } from '@/components/dashboard/AlertsSection';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentQCScores } from '@/components/dashboard/RecentQCScores';
import { useDashboardData } from '@/hooks/useDashboardData';
import { toast } from 'sonner';

export default function DashboardPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    jobCards,
    clockedInCleaners,
    alerts,
    qcDisplayScores,
    totalJobs,
    completeCount,
    inProgressCount,
    flaggedCount,
    isLoading,
    isAdmin,
  } = useDashboardData();

  const handleStartJob = async (jobId: string) => {
    if (!user) return;

    // Capture GPS (non-blocking if it fails)
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await getCurrentPosition();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // proceed without GPS
    }

    // Insert time_entry
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

    // Update job status
    await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);

    // Invalidate queries so banner appears
    queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['time-entry'] });

    toast.success('Clocked in!');

    // Navigate to job details
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
    return (
      <div className="space-y-6 max-w-2xl">
        <DashboardGreeting />

        <div>
          <h2 className="text-xl font-bold text-primary mb-4">My Jobs Today</h2>
          {jobCards.length === 0 ? (
            <div className="bg-card rounded-2xl shadow-md p-8 text-center">
              <p className="text-4xl mb-3">🌴</p>
              <p className="text-lg font-bold text-foreground mb-1">No jobs today.</p>
              <p className="text-muted-foreground">Enjoy your day!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobCards.map((job) => (
                <JobCard
                  key={job.id}
                  {...job}
                  showStartButton
                  showNavigateButton
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  onStartJob={() => handleStartJob(job.id)}
                />
              ))}
            </div>
          )}
        </div>

        <Button variant="outline" size="lg" onClick={() => navigate('/ai-assistant')} className="gap-2">
          <Bot className="h-5 w-5" />
          AI Assistant
        </Button>
      </div>
    );
  }

  // Admin / Head Cleaner dashboard
  return (
    <div className="space-y-8">
      <DashboardGreeting />

      <TodaySummary
        totalJobs={totalJobs}
        completeCount={completeCount}
        inProgressCount={inProgressCount}
        flaggedCount={flaggedCount}
      />

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

      <LiveStatusStrip clockedInCleaners={clockedInCleaners} />

      <AlertsSection alerts={alerts} />

      <QuickActions />

      <RecentQCScores scores={qcDisplayScores} />
    </div>
  );
}