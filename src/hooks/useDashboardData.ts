import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subMonths } from 'date-fns';

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
  const allJobCleanerIds = [...new Set(
    [...jobs, ...upcomingJobs].flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean)
  )];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['cleaner-profiles', allJobCleanerIds.sort().join(',')],
    queryFn: async () => {
      if (!allJobCleanerIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', allJobCleanerIds);
      return data || [];
    },
    enabled: allJobCleanerIds.length > 0,
  });
  const cleanerNameMap: Record<string, string> = {};
  cleanerProfiles.forEach((p: any) => { cleanerNameMap[p.id] = p.full_name || 'Unknown'; });

  // ── Active time entries (live status) ──
  const { data: activeTimeEntries = [] } = useQuery({
    queryKey: ['active-time-entries', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('user_id, clock_in_time, job_id, jobs(properties(property_name))')
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null);
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Month completed jobs (KPI: jobs + revenue) ──
  const { data: monthJobs = [] } = useQuery({
    queryKey: ['dashboard-month-jobs', monthStart, monthEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, status, price_ex_gst, invoice_status')
        .gte('scheduled_date', monthStart)
        .lte('scheduled_date', monthEnd)
        .eq('status', 'completed');
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Week jobs (for team performance) ──
  const { data: weekJobs = [] } = useQuery({
    queryKey: ['dashboard-week-jobs', weekStart, weekEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, status, price_ex_gst, cleaner_1_id, cleaner_2_id, clock_on, clock_off')
        .gte('scheduled_date', weekStart)
        .lte('scheduled_date', weekEnd);
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Average rating from job_feedback ──
  const { data: avgRating = null } = useQuery({
    queryKey: ['dashboard-avg-rating'],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('score')
        .not('score', 'is', null)
        .gt('score', 0);
      if (!data?.length) return null;
      const scores = data.map((f: any) => f.score);
      return (scores.reduce((a: number, b: number) => a + b, 0) / scores.length);
    },
    enabled: isAdmin,
  });

  // ── Active cleaners this week (cleaners with jobs this week) ──
  const activeCleanersThisWeek = new Set(
    weekJobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id].filter(Boolean))
  ).size;

  // ── Low ratings last 7 days ──
  const sevenDaysAgo = format(addDays(now, -7), 'yyyy-MM-dd');
  const { data: lowRatings = [] } = useQuery({
    queryKey: ['dashboard-low-ratings', sevenDaysAgo],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('id, score, job_id, created_at, client_id')
        .lt('score', 3)
        .gt('score', 0)
        .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Overdue invoices ──
  const { data: overdueInvoices = [] } = useQuery({
    queryKey: ['dashboard-overdue-invoices'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, price_ex_gst, invoice_status, properties(property_name)')
        .eq('status', 'completed')
        .gt('price_ex_gst', 0)
        .not('invoice_status', 'in', '("paid","voided")');
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Unassigned upcoming jobs ──
  const { data: unassignedJobs = [] } = useQuery({
    queryKey: ['unassigned-jobs', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, properties(property_name)')
        .gte('scheduled_date', today)
        .is('cleaner_1_id', null)
        .in('status', ['scheduled', 'pending']);
      return data || [];
    },
    enabled: isAdmin,
  });

  // ── Revenue trend: last 6 months ──
  const { data: revenueTrend = [] } = useQuery({
    queryKey: ['dashboard-revenue-trend'],
    queryFn: async () => {
      const months: { month: string; label: string; start: string; end: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(now, i);
        months.push({
          month: format(d, 'yyyy-MM'),
          label: format(d, 'MMM'),
          start: format(startOfMonth(d), 'yyyy-MM-dd'),
          end: format(endOfMonth(d), 'yyyy-MM-dd'),
        });
      }

      const { data } = await supabase
        .from('jobs')
        .select('scheduled_date, price_ex_gst')
        .eq('status', 'completed')
        .gte('scheduled_date', months[0].start)
        .lte('scheduled_date', months[months.length - 1].end)
        .gt('price_ex_gst', 0);

      return months.map(m => {
        const monthJobs = (data || []).filter((j: any) =>
          j.scheduled_date >= m.start && j.scheduled_date <= m.end
        );
        return {
          month: m.label,
          revenue: monthJobs.reduce((sum: number, j: any) => sum + Number(j.price_ex_gst || 0), 0),
        };
      });
    },
    enabled: isAdmin,
  });

  // ── Recent feedback (last 5) ──
  const { data: recentFeedback = [] } = useQuery({
    queryKey: ['dashboard-recent-feedback'],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('id, score, created_at, job_id, client_id, comments')
        .not('score', 'is', null)
        .gt('score', 0)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!data?.length) return [];

      // Fetch job details for addresses
      const jobIds = data.map((f: any) => f.job_id).filter(Boolean);
      const clientIds = [...new Set(data.map((f: any) => f.client_id).filter(Boolean))];

      const [jobsRes, clientsRes] = await Promise.all([
        jobIds.length ? supabase.from('jobs').select('id, properties(property_name, address)').in('id', jobIds) : { data: [] },
        clientIds.length ? supabase.from('profiles').select('id, full_name').in('id', clientIds) : { data: [] },
      ]);

      const jobMap: Record<string, any> = {};
      (jobsRes.data || []).forEach((j: any) => { jobMap[j.id] = j; });
      const clientMap: Record<string, string> = {};
      (clientsRes.data || []).forEach((p: any) => { clientMap[p.id] = p.full_name || 'Client'; });

      return data.map((f: any) => ({
        id: f.id,
        score: f.score,
        createdAt: f.created_at,
        clientName: clientMap[f.client_id] || 'Client',
        address: jobMap[f.job_id]?.properties?.address || jobMap[f.job_id]?.properties?.property_name || '',
      }));
    },
    enabled: isAdmin,
  });

  // ── All cleaners for team performance ──
  const { data: allCleanerData = [] } = useQuery({
    queryKey: ['dashboard-all-cleaners'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').in('role', ['cleaner', 'head_cleaner']);
      if (!roles?.length) return [];
      const ids = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      return (profiles || []).map((p: any) => ({ id: p.id, name: p.full_name || 'Unknown' }));
    },
    enabled: isAdmin,
  });

  // ── Feedback for week jobs ──
  const weekJobIds = weekJobs.map((j: any) => j.id);
  const { data: weekFeedback = [] } = useQuery({
    queryKey: ['dashboard-week-feedback', weekJobIds.join(',')],
    queryFn: async () => {
      if (!weekJobIds.length) return [];
      const { data } = await supabase
        .from('job_feedback')
        .select('job_id, score')
        .in('job_id', weekJobIds.slice(0, 500))
        .not('score', 'is', null);
      return data || [];
    },
    enabled: isAdmin && weekJobIds.length > 0,
  });

  // ── Compute team performance ──
  const feedbackByJob: Record<string, number> = {};
  weekFeedback.forEach((f: any) => { feedbackByJob[f.job_id] = f.score; });

  const teamPerformance = allCleanerData.map((cleaner: any) => {
    const cleanerWeekJobs = weekJobs.filter((j: any) =>
      j.cleaner_1_id === cleaner.id || j.cleaner_2_id === cleaner.id
    );
    const jobCount = cleanerWeekJobs.length;
    const scores = cleanerWeekJobs
      .map((j: any) => feedbackByJob[j.id])
      .filter((s: any) => s != null && s > 0);
    const avgRating = scores.length > 0
      ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
      : null;

    // Hours from clock_on/clock_off
    let totalMinutes = 0;
    cleanerWeekJobs.forEach((j: any) => {
      if (j.clock_on && j.clock_off) {
        const diff = new Date(j.clock_off).getTime() - new Date(j.clock_on).getTime();
        if (diff > 0) totalMinutes += diff / 60000;
      }
    });

    const isActive = activeTimeEntries.some((e: any) => e.user_id === cleaner.id);

    return {
      id: cleaner.id,
      name: cleaner.name,
      jobCount,
      avgRating,
      hoursWorked: Math.round(totalMinutes / 60 * 10) / 10,
      isActive,
    };
  }).sort((a: any, b: any) => b.jobCount - a.jobCount);

  // ── KPIs ──
  const completedThisMonth = monthJobs.length;
  const revenueThisMonth = monthJobs
    .filter((j: any) => j.price_ex_gst && j.price_ex_gst > 0)
    .reduce((sum: number, j: any) => sum + Number(j.price_ex_gst), 0);

  // Today stats
  const totalJobsToday = jobs.length;
  const scheduledToday = jobs.filter((j: any) => j.status === 'scheduled' || j.status === 'confirmed').length;
  const inProgressToday = jobs.filter((j: any) => j.status === 'in_progress').length;
  const completedToday = jobs.filter((j: any) => j.status === 'completed' || j.status === 'complete').length;

  // Live status
  const clockedInCleaners = activeTimeEntries.map((entry: any) => ({
    name: cleanerNameMap[entry.user_id] || 'Unknown',
    propertyName: (entry as any).jobs?.properties?.property_name || 'No property assigned',
    clockInTime: entry.clock_in_time,
    userId: entry.user_id,
  }));

  // Alerts
  const alerts: { id: string; message: string; type: string }[] = [];
  lowRatings.forEach((f: any) => {
    alerts.push({ id: `low-rating-${f.id}`, message: `Low rating (${f.score}/5) received — follow up needed`, type: 'warning' });
  });
  overdueInvoices.forEach((j: any) => {
    alerts.push({ id: `overdue-${j.id}`, message: `Overdue invoice — ${(j as any).properties?.property_name || 'Job'} ($${Number(j.price_ex_gst).toFixed(0)})`, type: 'danger' });
  });
  unassignedJobs.forEach((j: any) => {
    alerts.push({ id: `unassigned-${j.id}`, message: `Unassigned job on ${j.scheduled_date} — ${(j as any).properties?.property_name || 'Property'}`, type: 'warning' });
  });

  // Job cards
  const jobCards = jobs.map((job: any) => ({
    id: job.id,
    propertyName: job.properties?.property_name || 'No property assigned',
    address: [job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ') || null,
    scheduledTime: job.scheduled_time ? job.scheduled_time.slice(0, 5) : null,
    status: job.status,
    cleaner1Name: job.cleaner_1_id ? cleanerNameMap[job.cleaner_1_id] || null : null,
    cleaner2Name: job.cleaner_2_id ? cleanerNameMap[job.cleaner_2_id] || null : null,
    isRecurring: !!job.series_id,
    feedbackScore: job.feedback_score,
  }));

  // Upcoming job cards (next 7 days, for cleaner view)
  const upcomingJobCards = upcomingJobs.map((job: any) => ({
    id: job.id,
    propertyName: job.properties?.property_name || 'No property assigned',
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
    isLoading: jobsLoading,
    isAdmin,
    teamPerformance,
    revenueTrend,
    recentFeedback,
    kpi: {
      completedThisMonth,
      revenueThisMonth,
      avgRating,
      activeCleanersThisWeek,
      totalJobsToday,
      scheduledToday,
      inProgressToday,
      completedToday,
    },
  };
}
