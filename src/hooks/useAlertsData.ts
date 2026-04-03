import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';

export interface AlertItem {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  timestamp?: string;
  path?: string;
  meta?: Record<string, any>;
}

export interface AlertGroup {
  key: string;
  label: string;
  borderColor: string;
  icon: string;
  items: AlertItem[];
}

const REFETCH_INTERVAL = 60_000; // 60 seconds

export function useAlertsData() {
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'head_cleaner';
  const today = format(new Date(), 'yyyy-MM-dd');

  // 1. Jobs Not Invoiced — RED
  const { data: notInvoiced = [] } = useQuery({
    queryKey: ['alerts-not-invoiced'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('jobs')
        .select('id, clock_off_at, scheduled_date, price_ex_gst, properties(property_name, address, client_name)')
        .in('status', ['completed', 'complete'])
        .or('invoice_status.is.null,invoice_status.eq.not_raised')
        .lt('clock_off_at', cutoff)
        .order('clock_off_at', { ascending: true })
        .limit(50);
      return (data || []).map((j: any) => ({
        id: `ni-${j.id}`,
        group: 'not_invoiced',
        title: `${(j.properties as any)?.address || (j.properties as any)?.property_name || 'Job'}`,
        subtitle: `Completed ${j.clock_off_at ? formatDistanceToNow(new Date(j.clock_off_at), { addSuffix: true }) : j.scheduled_date} — Invoice not raised`,
        timestamp: j.clock_off_at,
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  // 2. Invoices Overdue — RED
  const { data: overdue = [] } = useQuery({
    queryKey: ['alerts-overdue'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('jobs')
        .select('id, invoice_sent_at, price_ex_gst, properties(property_name, client_name)')
        .eq('invoice_status', 'sent')
        .lt('invoice_sent_at', cutoff)
        .order('invoice_sent_at', { ascending: true })
        .limit(50);
      return (data || []).map((j: any) => {
        const dueDate = j.invoice_sent_at ? new Date(new Date(j.invoice_sent_at).getTime() + 7 * 86400000) : null;
        const daysOverdue = dueDate ? Math.floor((Date.now() - dueDate.getTime()) / 86400000) : 0;
        return {
          id: `od-${j.id}`,
          group: 'overdue',
          title: `${(j.properties as any)?.client_name || 'Client'} — ${(j.properties as any)?.property_name || 'Property'} — $${j.price_ex_gst || 0}`,
          subtitle: `${daysOverdue} days overdue`,
          timestamp: j.invoice_sent_at,
          path: `/jobs/${j.id}`,
          meta: { jobId: j.id },
        };
      });
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  // 3. Re-Clean Required — RED
  const { data: reClean = [] } = useQuery({
    queryKey: ['alerts-re-clean'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, audit_completed_at, audited_by, properties(property_name)')
        .eq('audit_outcome', 'return_required')
        .order('audit_completed_at', { ascending: false })
        .limit(20);
      if (!data || data.length === 0) return [];
      const auditorIds = data.map((j: any) => j.audited_by).filter(Boolean);
      let nameMap: Record<string, string> = {};
      if (auditorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', auditorIds);
        (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });
      }
      return data.map((j: any) => ({
        id: `rc-${j.id}`,
        group: 're_clean',
        title: `${(j.properties as any)?.property_name || 'Property'}`,
        subtitle: `Failed audit by ${nameMap[j.audited_by] || 'auditor'} — ${j.audit_completed_at ? format(new Date(j.audit_completed_at), 'd MMM') : ''}`,
        timestamp: j.audit_completed_at,
        path: `/jobs/${j.id}`,
      }));
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  // 4. Extra Time Requests — ORANGE
  const { data: extraTime = [] } = useQuery({
    queryKey: ['alerts-extra-time'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, extra_time_notes, cleaner_1_id, clock_on, properties(property_name)')
        .eq('extra_time_requested', true)
        .is('extra_time_approved' as any, null)
        .eq('status', 'in_progress')
        .order('clock_on', { ascending: true })
        .limit(20);
      if (!data || data.length === 0) return [];
      const cleanerIds = data.map((j: any) => j.cleaner_1_id).filter(Boolean);
      let nameMap: Record<string, string> = {};
      if (cleanerIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
        (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });
      }
      return data.map((j: any) => ({
        id: `et-${j.id}`,
        group: 'extra_time',
        title: `${nameMap[j.cleaner_1_id] || 'Cleaner'} at ${(j.properties as any)?.property_name || 'property'}`,
        subtitle: j.extra_time_notes || 'Needs extra time',
        timestamp: j.clock_on,
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  // 5. Invoices Not Sent — ORANGE
  const { data: notSent = [] } = useQuery({
    queryKey: ['alerts-not-sent'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('jobs')
        .select('id, invoice_raised_at, properties(property_name, client_name)')
        .eq('invoice_status', 'raised')
        .lt('invoice_raised_at', cutoff)
        .order('invoice_raised_at', { ascending: true })
        .limit(50);
      return (data || []).map((j: any) => ({
        id: `ns-${j.id}`,
        group: 'not_sent',
        title: `${(j.properties as any)?.client_name || (j.properties as any)?.property_name || 'Client'}`,
        subtitle: `Invoice raised ${j.invoice_raised_at ? formatDistanceToNow(new Date(j.invoice_raised_at), { addSuffix: true }) : ''}`,
        timestamp: j.invoice_raised_at,
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  // 6. Quotes Awaiting — YELLOW
  const { data: quotesAwaiting = [] } = useQuery({
    queryKey: ['alerts-quotes-awaiting'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, address, clean_type, created_at')
        .in('status', ['pending_form', 'form_submitted', 'awaiting_quote'])
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true });
      return (data || []).map((r: any) => ({
        id: `qa-${r.id}`,
        group: 'quotes_awaiting',
        title: `Quote Request — ${[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown'}`,
        subtitle: `${r.address || 'No address'} — ${r.clean_type || 'TBC'} — ${formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}`,
        timestamp: r.created_at,
        path: `/quoting?lead=${r.id}`,
      }));
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  // 7. Cleaners Not Clocked On — YELLOW
  const { data: notClockedOn = [] } = useQuery({
    queryKey: ['alerts-not-clocked-on', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_time, cleaner_1_id, properties(property_name)')
        .eq('scheduled_date', today)
        .in('status', ['confirmed', 'scheduled'])
        .is('clock_on', null)
        .not('scheduled_time', 'is', null)
        .limit(50);
      if (!data || data.length === 0) return [];
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const late = data.filter((j: any) => {
        const parts = (j.scheduled_time as string).split(':');
        const schedMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        return nowMins - schedMins >= 30;
      });
      if (late.length === 0) return [];
      const cleanerIds = late.map((j: any) => j.cleaner_1_id).filter(Boolean);
      let nameMap: Record<string, string> = {};
      if (cleanerIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
        (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });
      }
      return late.map((j: any) => ({
        id: `nco-${j.id}`,
        group: 'not_clocked_on',
        title: `${nameMap[j.cleaner_1_id] || 'Cleaner'} — ${(j.properties as any)?.property_name || 'property'}`,
        subtitle: `Scheduled ${(j.scheduled_time as string).slice(0, 5)} — Not clocked on`,
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  // 8. Low Client Ratings — GREY
  const { data: lowRatings = [] } = useQuery({
    queryKey: ['alerts-low-ratings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('id, job_id, score, submitted_at')
        .lte('score', 3)
        .gt('score', 0)
        .order('submitted_at', { ascending: false })
        .limit(20);
      if (!data || data.length === 0) return [];
      const jobIds = data.map((f: any) => f.job_id).filter(Boolean);
      const { data: jobs } = await supabase.from('jobs').select('id, properties(property_name, client_name)').in('id', jobIds);
      const jobMap: Record<string, any> = {};
      (jobs || []).forEach((j: any) => { jobMap[j.id] = j; });
      return data.map((f: any) => {
        const j = jobMap[f.job_id];
        return {
          id: `lr-${f.id}`,
          group: 'low_ratings',
          title: `${(j?.properties as any)?.property_name || 'Property'} — ${f.score}/5`,
          subtitle: `${(j?.properties as any)?.client_name || 'Client'} — ${f.submitted_at ? format(new Date(f.submitted_at), 'd MMM') : ''}`,
          timestamp: f.submitted_at,
          path: `/jobs/${f.job_id}`,
        };
      });
    },
    enabled: isAdmin,
    refetchInterval: REFETCH_INTERVAL,
  });

  const groups: AlertGroup[] = [
    { key: 'not_invoiced', label: 'Jobs Not Invoiced', borderColor: 'border-l-[hsl(0,84%,60%)]', icon: '🧾', items: notInvoiced },
    { key: 'overdue', label: 'Invoices Overdue', borderColor: 'border-l-[hsl(0,84%,60%)]', icon: '⏰', items: overdue },
    { key: 're_clean', label: 'Re-Clean Required', borderColor: 'border-l-[hsl(0,84%,60%)]', icon: '🔄', items: reClean },
    { key: 'extra_time', label: 'Extra Time Requests', borderColor: 'border-l-[hsl(25,95%,53%)]', icon: '⏱️', items: extraTime },
    { key: 'not_sent', label: 'Invoices Not Sent', borderColor: 'border-l-[hsl(25,95%,53%)]', icon: '📤', items: notSent },
    { key: 'quotes_awaiting', label: 'Quotes Awaiting Response', borderColor: 'border-l-[hsl(48,96%,53%)]', icon: '📋', items: quotesAwaiting },
    { key: 'not_clocked_on', label: 'Cleaners Not Clocked On', borderColor: 'border-l-[hsl(48,96%,53%)]', icon: '🕐', items: notClockedOn },
    { key: 'low_ratings', label: 'Low Client Ratings', borderColor: 'border-l-muted-foreground/30', icon: '⭐', items: lowRatings },
  ];

  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return { groups, totalCount, isAdmin };
}
