import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, addHours } from 'date-fns';

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

  // Fetch job acceptances for today's jobs + next 48hrs for action needed count
  const allJobIds = jobs.map((j: any) => j.id);
  const { data: jobAcceptances = [] } = useQuery({
    queryKey: ['dashboard-acceptances', allJobIds],
    queryFn: async () => {
      if (allJobIds.length === 0) return [];
      const { data, error } = await supabase
        .from('job_acceptances')
        .select('*')
        .in('job_id', allJobIds);
      if (error) throw error;
      return data || [];
    },
    enabled: allJobIds.length > 0,
  });

  // Fetch upcoming 48hr jobs for action needed
  const in48hrs = format(addHours(new Date(), 48), 'yyyy-MM-dd');
  const { data: upcoming48hrJobs = [] } = useQuery({
    queryKey: ['dashboard-upcoming-48hr', today, in48hrs],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id')
        .gte('scheduled_date', today)
        .lte('scheduled_date', in48hrs)
        .in('status', ['scheduled', 'pending']);
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: upcoming48hrAcceptances = [] } = useQuery({
    queryKey: ['dashboard-upcoming-48hr-acceptances', upcoming48hrJobs.map((j: any) => j.id)],
    queryFn: async () => {
      const ids = upcoming48hrJobs.map((j: any) => j.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('job_acceptances')
        .select('job_id, acceptance_status')
        .in('job_id', ids)
        .in('acceptance_status', ['pending', 'declined']);
      if (error) throw error;
      return data || [];
    },
    enabled: upcoming48hrJobs.length > 0,
  });

  // Fetch pending booking requests count
  const { data: pendingRequestsCount = 0 } = useQuery({
    queryKey: ['pending-requests-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('clean_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count || 0;
    },
    enabled: isAdmin,
  });

  // Fetch completed unpaid jobs count
  const { data: completedUnpaidCount = 0 } = useQuery({
    queryKey: ['completed-unpaid-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'complete')
        .gt('price_ex_gst', 0)
        .not('invoice_status', 'in', '("paid","voided")');
      if (error) throw error;
      return count || 0;
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

  // Action needed: unique jobs in next 48hrs with pending/declined acceptances
  const actionNeededJobIds = new Set(upcoming48hrAcceptances.map((a: any) => a.job_id));
  const actionNeededCount = actionNeededJobIds.size;

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
    actionNeededCount,
    pendingRequestsCount,
    completedUnpaidCount,
    isLoading: jobsLoading,
    isAdmin,
  };
}
