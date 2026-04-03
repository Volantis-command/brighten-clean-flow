import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export interface ActionItem {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  timestamp?: string;
  path?: string;
  meta?: Record<string, any>;
}

export function useActionsData() {
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'head_cleaner';
  const today = format(new Date(), 'yyyy-MM-dd');

  // Quotes awaiting response >24hrs
  const { data: quotesAwaiting = [] } = useQuery({
    queryKey: ['actions-quotes-awaiting'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, address, clean_type, created_at')
        .in('status', ['form_submitted', 'awaiting_quote'])
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true });
      return (data || []).map((r: any) => ({
        id: `qa-${r.id}`,
        group: 'quotes_awaiting',
        title: `Quote Request — ${[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown'}`,
        subtitle: `${r.address || 'No address'} — ${r.clean_type || 'TBC'}`,
        timestamp: r.created_at,
        path: `/quoting?lead=${r.id}`,
      }));
    },
    enabled: isAdmin,
  });

  // Jobs not invoiced (completed >1hr ago, invoice_status = 'not_raised' or null)
  const { data: notInvoiced = [] } = useQuery({
    queryKey: ['actions-not-invoiced'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, clock_off_at, price_ex_gst, properties(property_name, address)')
        .eq('status', 'completed')
        .or('invoice_status.is.null,invoice_status.eq.not_raised')
        .lt('clock_off_at', cutoff)
        .order('clock_off_at', { ascending: true })
        .limit(50);
      return (data || []).map((j: any) => ({
        id: `ni-${j.id}`,
        group: 'not_invoiced',
        title: (j.properties as any)?.property_name || 'Job',
        subtitle: `Completed ${j.clock_off_at ? format(new Date(j.clock_off_at), 'd MMM h:mm a') : j.scheduled_date} — Invoice not raised`,
        timestamp: j.clock_off_at,
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
  });

  // Invoices not sent (raised >24hrs)
  const { data: notSent = [] } = useQuery({
    queryKey: ['actions-not-sent'],
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
        subtitle: `Invoice raised ${j.invoice_raised_at ? format(new Date(j.invoice_raised_at), 'd MMM') : ''}`,
        timestamp: j.invoice_raised_at,
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
  });

  // Invoices overdue (sent >7 days ago)
  const { data: overdue = [] } = useQuery({
    queryKey: ['actions-overdue'],
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
          title: `${(j.properties as any)?.client_name || 'Client'} — $${j.price_ex_gst || 0}`,
          subtitle: `Due ${dueDate ? format(dueDate, 'd MMM') : '?'} — ${daysOverdue} days overdue`,
          timestamp: j.invoice_sent_at,
          path: `/jobs/${j.id}`,
          meta: { jobId: j.id, xero: true },
        };
      });
    },
    enabled: isAdmin,
  });

  // Extra time requests pending
  const { data: extraTime = [] } = useQuery({
    queryKey: ['actions-extra-time'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, extra_time_notes, cleaner_1_id, properties(property_name, address)')
        .eq('extra_time_requested', true)
        .eq('status', 'in_progress')
        .order('clock_on', { ascending: true })
        .limit(20);

      if (!data || data.length === 0) return [];
      const cleanerIds = data.map((j: any) => j.cleaner_1_id).filter(Boolean);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });

      return data.map((j: any) => ({
        id: `et-${j.id}`,
        group: 'extra_time',
        title: `${nameMap[j.cleaner_1_id] || 'Cleaner'} at ${(j.properties as any)?.property_name || 'property'}`,
        subtitle: j.extra_time_notes || 'Needs extra time',
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
  });

  // Re-clean required
  const { data: reClean = [] } = useQuery({
    queryKey: ['actions-re-clean'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, audit_completed_at, audited_by, properties(property_name)')
        .eq('audit_outcome', 'return_required')
        .order('audit_completed_at', { ascending: false })
        .limit(20);

      if (!data || data.length === 0) return [];
      const auditorIds = data.map((j: any) => j.audited_by).filter(Boolean);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', auditorIds);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });

      return data.map((j: any) => ({
        id: `rc-${j.id}`,
        group: 're_clean',
        title: (j.properties as any)?.property_name || 'Property',
        subtitle: `Failed audit by ${nameMap[j.audited_by] || 'auditor'} — ${j.audit_completed_at ? format(new Date(j.audit_completed_at), 'd MMM') : ''}`,
        timestamp: j.audit_completed_at,
        path: `/jobs/${j.id}`,
      }));
    },
    enabled: isAdmin,
  });

  // Cleaners not clocked on (30+ min past schedule)
  const { data: notClockedOn = [] } = useQuery({
    queryKey: ['actions-not-clocked-on', today],
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

      // Filter only 30+ min past
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const late = data.filter((j: any) => {
        const parts = (j.scheduled_time as string).split(':');
        const schedMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        return nowMins - schedMins >= 30;
      });

      if (late.length === 0) return [];
      const cleanerIds = late.map((j: any) => j.cleaner_1_id).filter(Boolean);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', cleanerIds);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });

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
  });

  // Low ratings (feedback <=3)
  const { data: lowRatings = [] } = useQuery({
    queryKey: ['actions-low-ratings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('id, job_id, score, client_id, submitted_at')
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
  });

  // Legacy groups for backward compat
  const { data: quotesNeeded = [] } = useQuery({
    queryKey: ['actions-quotes-needed-qr'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, address, clean_type, created_at')
        .in('status', ['form_submitted', 'awaiting_quote'])
        .order('created_at', { ascending: true });
      return (data || []).map((r: any) => ({
        id: `qn-${r.id}`,
        group: 'quotes_needed',
        title: `Quote needed — ${[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown'}`,
        subtitle: `${r.address || 'No address'} — ${r.clean_type || 'TBC'}`,
        timestamp: r.created_at,
        path: `/quoting?lead=${r.id}`,
      }));
    },
    enabled: isAdmin,
  });

  const { data: confirmCleanDate = [] } = useQuery({
    queryKey: ['actions-confirm-clean-date'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, phone, address, clean_type, preferred_date, preferred_time, accepted_at, total_inc_gst, bedrooms, bathrooms, email')
        .eq('status', 'accepted')
        .order('accepted_at', { ascending: true });
      return (data || []).map((r: any) => ({
        id: `ccd-${r.id}`,
        group: 'confirm_clean_date',
        title: `Booking received — ${[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Client'}`,
        subtitle: `${r.address || ''} — ${r.preferred_date || ''}`,
        timestamp: r.accepted_at,
        path: undefined,
        meta: {
          quoteRequestId: r.id,
          clientName: [r.first_name, r.last_name].filter(Boolean).join(' '),
          clientPhone: r.phone,
          clientEmail: r.email,
          address: r.address,
          cleanType: r.clean_type,
          preferredDate: r.preferred_date,
          preferredTime: r.preferred_time,
          totalIncGst: r.total_inc_gst,
          bedrooms: r.bedrooms,
          bathrooms: r.bathrooms,
        },
      }));
    },
    enabled: isAdmin,
  });

  const totalCount = quotesAwaiting.length + notInvoiced.length + notSent.length + overdue.length +
    extraTime.length + reClean.length + notClockedOn.length + lowRatings.length +
    quotesNeeded.length + confirmCleanDate.length;

  return {
    quotesAwaiting,
    notInvoiced,
    notSent,
    overdue,
    extraTime,
    reClean,
    notClockedOn,
    lowRatings,
    quotesNeeded,
    confirmCleanDate,
    totalCount,
    isAdmin,
  };
}
