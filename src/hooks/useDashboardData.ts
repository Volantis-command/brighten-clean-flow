import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export function useDashboardData() {
  const { user, role } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const isAdmin = role === 'admin' || role === 'head_cleaner';

  // Fetch today's jobs
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['dashboard-jobs', today, role],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb)')
        .eq('scheduled_date', today)
        .order('scheduled_time', { ascending: true });

      if (!isAdmin && user) {
        query = query.or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch cleaner profiles for job display
  const cleanerIds = [
    ...new Set(
      jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean)
    ),
  ];

  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['cleaner-profiles', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', cleanerIds);
      if (error) throw error;
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  // Fetch active time entries (clocked in but not out) for live status
  const { data: activeTimeEntries = [] } = useQuery({
    queryKey: ['active-time-entries', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('user_id, job_id, jobs(properties(property_name))')
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null);
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  // Fetch recent QC scores
  const { data: qcScores = [] } = useQuery({
    queryKey: ['recent-qc-scores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qc_audits')
        .select('id, percentage, result, property_id, inspector_id, properties(property_name)')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  // Build cleaner name lookup
  const cleanerNameMap: Record<string, string> = {};
  cleanerProfiles.forEach((p: any) => {
    cleanerNameMap[p.id] = p.full_name || 'Unknown';
  });

  // Build live status
  const clockedInCleaners = activeTimeEntries.map((entry: any) => ({
    name: cleanerNameMap[entry.user_id] || 'Unknown',
    propertyName: (entry as any).jobs?.properties?.property_name || 'Unknown property',
  }));

  // Build alerts
  const alerts: { id: string; message: string; type: 'flagged' | 'incomplete_form' | 'critical_item' }[] = [];
  jobs.forEach((job: any) => {
    if (job.status === 'flagged') {
      const propName = job.properties?.property_name || 'Unknown';
      alerts.push({
        id: `flagged-${job.id}`,
        message: `Flagged job at ${propName} — requires attention`,
        type: 'flagged',
      });
    }
  });

  // Build QC display data
  const qcDisplayScores = qcScores.map((qc: any) => ({
    id: qc.id,
    cleanerName: cleanerNameMap[qc.inspector_id] || 'Inspector',
    propertyName: qc.properties?.property_name || 'Unknown',
    percentage: qc.percentage || 0,
    result: qc.result || 'fail',
  }));

  // Summary counts
  const totalJobs = jobs.length;
  const completeCount = jobs.filter((j: any) => j.status === 'complete').length;
  const inProgressCount = jobs.filter((j: any) => j.status === 'in_progress').length;
  const flaggedCount = jobs.filter((j: any) => j.status === 'flagged').length;

  // Build job cards
  const jobCards = jobs.map((job: any) => ({
    id: job.id,
    propertyName: job.properties?.property_name || 'Unknown Property',
    address: [job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ') || null,
    scheduledTime: job.scheduled_time ? job.scheduled_time.slice(0, 5) : null,
    status: job.status,
    cleaner1Name: job.cleaner_1_id ? cleanerNameMap[job.cleaner_1_id] || null : null,
    cleaner2Name: job.cleaner_2_id ? cleanerNameMap[job.cleaner_2_id] || null : null,
  }));

  return {
    jobCards,
    clockedInCleaners,
    alerts,
    qcDisplayScores,
    totalJobs,
    completeCount,
    inProgressCount,
    flaggedCount,
    isLoading: jobsLoading,
    isAdmin,
  };
}
