import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';

export function useDashboardData() {
  const { user, role } = useAuth();
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const isAdmin = role === 'admin' || role === 'head_cleaner';

  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  // ── Today's jobs (full data for cards) ──
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

  // ── Upcoming 7 days jobs for cleaners ──
  const upcomingEnd = format(addDays(now, 7), 'yyyy-MM-dd');
  const { data: upcomingJobs = [] } = useQuery({
    queryKey: ['dashboard-upcoming-7d', today, upcomingEnd, role],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb)')
        .gt('scheduled_date', today)
        .lte('scheduled_date', upcomingEnd)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });
      if (!isAdmin) {
        query = query.or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // ── Cleaner profiles ──
  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['cleaner-profiles', cleanerIds],
    queryFn: async () => {
      if (!cleanerIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });
  const cleanerNameMap: Record<string, string> = {};
  cleanerProfiles.forEach((p: any) => { cleanerNameMap[p.id] = p.full_name || 'Unknown'; });

  // ── Active time entries (live status) ──
  const { data: activeTimeEntries = [] } = useQuery({
    queryKey: ['active-time-entries', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('user_id, job_id, jobs(properties(property_name))')
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null);
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Week jobs (for scheduled + completed this week + revenue) ──
  const { data: weekJobs = [] } = useQuery({
    queryKey: ['dashboard-week-jobs', weekStart, weekEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, status, price_ex_gst, invoice_status, cleaner_1_id, cleaner_2_id')
        .gte('scheduled_date', weekStart)
        .lte('scheduled_date', weekEnd);
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Month financial data ──
  const { data: monthJobs = [] } = useQuery({
    queryKey: ['dashboard-month-jobs', monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, status, price_ex_gst, invoice_status')
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd);
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Unpaid invoices (all time, complete + price > 0 + not paid/voided) ──
  const { data: unpaidInvoices = [] } = useQuery({
    queryKey: ['dashboard-unpaid-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, price_ex_gst, invoice_status')
        .eq('status', 'complete')
        .gt('price_ex_gst', 0)
        .not('invoice_status', 'in', '("paid","voided")');
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Pending booking requests ──
  const { data: pendingRequestsCount = 0 } = useQuery({
    queryKey: ['pending-requests-count'],
    queryFn: async () => {
      const { count } = await supabase.from('clean_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      return count || 0;
    },
    enabled: isAdmin,
  });

  // ── Awaiting quote jobs ──
  const { data: awaitingQuoteCount = 0 } = useQuery({
    queryKey: ['awaiting-quote-count'],
    queryFn: async () => {
      const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_quote');
      return count || 0;
    },
    enabled: isAdmin,
  });

  // ── Onboarding forms not sent ──
  const { data: onboardingNotSentCount = 0 } = useQuery({
    queryKey: ['onboarding-not-sent'],
    queryFn: async () => {
      const { count } = await supabase
        .from('client_properties')
        .select('id', { count: 'exact', head: true })
        .eq('onboard_used', false)
        .is('onboarding_sent_at', null);
      return count || 0;
    },
    enabled: isAdmin,
  });

  // ── All cleaners (non-client staff) for "no jobs this week" ──
  const { data: allCleanerIds = [] } = useQuery({
    queryKey: ['all-cleaner-ids'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['cleaner', 'head_cleaner']);
      return (data || []).map(r => r.user_id);
    },
    enabled: isAdmin,
  });

  // ── Jobs with no cleaner assigned (upcoming) ──
  const { data: unassignedJobsCount = 0 } = useQuery({
    queryKey: ['unassigned-jobs-count', today],
    queryFn: async () => {
      const { count } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_date', today)
        .is('cleaner_1_id', null)
        .in('status', ['scheduled', 'pending']);
      return count || 0;
    },
    enabled: isAdmin,
  });

  // ── Recent QC scores ──
  const { data: qcScores = [] } = useQuery({
    queryKey: ['recent-qc-scores'],
    queryFn: async () => {
      const { data } = await supabase
        .from('qc_audits')
        .select('id, percentage, result, property_id, inspector_id, properties(property_name)')
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Derived KPIs ──

  // Today
  const totalJobsToday = jobs.length;
  const inProgressToday = jobs.filter((j: any) => j.status === 'in_progress').length;
  const completedToday = jobs.filter((j: any) => j.status === 'complete').length;
  const flaggedCount = jobs.filter((j: any) => j.status === 'flagged').length;

  // This week
  const scheduledThisWeek = weekJobs.length;
  const completedThisWeek = weekJobs.filter((j: any) => j.status === 'complete').length;
  const revenueThisWeek = weekJobs
    .filter((j: any) => j.status === 'complete' && j.price_ex_gst)
    .reduce((sum: number, j: any) => sum + Number(j.price_ex_gst), 0);

  // Financial
  const unpaidCount = unpaidInvoices.length;
  const unpaidTotal = unpaidInvoices.reduce((sum: number, j: any) => sum + Number(j.price_ex_gst || 0), 0);
  const paidThisMonth = monthJobs
    .filter((j: any) => j.invoice_status === 'paid' && j.price_ex_gst)
    .reduce((sum: number, j: any) => sum + Number(j.price_ex_gst), 0);
  const outstandingThisMonth = monthJobs
    .filter((j: any) => j.status === 'complete' && j.price_ex_gst && j.invoice_status !== 'paid' && j.invoice_status !== 'voided')
    .reduce((sum: number, j: any) => sum + Number(j.price_ex_gst), 0);

  // Alerts — cleaners with no jobs this week
  const weekCleanerIds = new Set(weekJobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id].filter(Boolean)));
  const idleCleanersCount = allCleanerIds.filter(id => !weekCleanerIds.has(id)).length;

  // Live status
  const clockedInCleaners = activeTimeEntries.map((entry: any) => ({
    name: cleanerNameMap[entry.user_id] || 'Unknown',
    propertyName: (entry as any).jobs?.properties?.property_name || 'Unknown property',
  }));

  // Alerts
  const alerts: { id: string; message: string; type: 'flagged' | 'incomplete_form' | 'critical_item' }[] = [];
  jobs.forEach((job: any) => {
    if (job.status === 'flagged') {
      alerts.push({ id: `flagged-${job.id}`, message: `Flagged job at ${job.properties?.property_name || 'Unknown'} — requires attention`, type: 'flagged' });
    }
  });

  // QC display
  const qcDisplayScores = qcScores.map((qc: any) => ({
    id: qc.id,
    cleanerName: cleanerNameMap[qc.inspector_id] || 'Inspector',
    propertyName: qc.properties?.property_name || 'Unknown',
    percentage: qc.percentage || 0,
    result: qc.result || 'fail',
  }));

  // Job cards
  const jobCards = jobs.map((job: any) => ({
    id: job.id,
    propertyName: job.properties?.property_name || 'Unknown Property',
    address: [job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ') || null,
    scheduledTime: job.scheduled_time ? job.scheduled_time.slice(0, 5) : null,
    status: job.status,
    cleaner1Name: job.cleaner_1_id ? cleanerNameMap[job.cleaner_1_id] || null : null,
    cleaner2Name: job.cleaner_2_id ? cleanerNameMap[job.cleaner_2_id] || null : null,
  }));

  // Upcoming job cards (next 7 days, for cleaner view)
  const upcomingJobCards = upcomingJobs.map((job: any) => ({
    id: job.id,
    propertyName: job.properties?.property_name || 'Unknown Property',
    address: [job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ') || null,
    scheduledTime: job.scheduled_time ? job.scheduled_time.slice(0, 5) : null,
    scheduledDate: job.scheduled_date,
    status: job.status,
  }));

  return {
    jobCards,
    upcomingJobCards,
    clockedInCleaners,
    alerts,
    qcDisplayScores,
    isLoading: jobsLoading,
    isAdmin,
    // KPIs
    kpi: {
      // Row 1 — Today
      totalJobsToday,
      inProgressToday,
      completedToday,
      flaggedCount,
      // Row 2 — This Week
      scheduledThisWeek,
      completedThisWeek,
      revenueThisWeek,
      // Row 3 — Financial
      unpaidCount,
      unpaidTotal,
      paidThisMonth,
      outstandingThisMonth,
      // Row 4 — Alerts
      pendingRequestsCount,
      onboardingNotSentCount,
      idleCleanersCount,
      unassignedJobsCount,
    },
  };
}
