import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, addDays } from 'date-fns';

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

  // GROUP 1a: Quotes Needed — from quote_requests
  const { data: quoteRequestItems = [] } = useQuery({
    queryKey: ['actions-quotes-needed-qr'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, phone, address, clean_type, preferred_date, bedrooms, bathrooms, status, created_at')
        .in('status', ['form_submitted', 'awaiting_quote'])
        .order('created_at', { ascending: true });
      return (data || []).map((r: any) => ({
        id: `qn-${r.id}`,
        group: 'quotes_needed',
        title: `Quote needed — ${[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown'}`,
        subtitle: `${r.address || 'No address'} · ${r.clean_type || 'Clean type TBC'} · ${r.preferred_date || 'Date TBC'}`,
        timestamp: r.created_at,
        path: `/quoting?lead=${r.id}`,
        meta: { quoteRequestId: r.id },
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 1b: Quotes Needed — from leads table (enquiry form submissions)
  const { data: leadItems = [] } = useQuery({
    queryKey: ['actions-quotes-needed-leads'],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone, address, suburb, service_type, bedrooms, bathrooms, status, created_at')
        .eq('status', 'new')
        .order('created_at', { ascending: true });
      return (data || []).map((r: any) => ({
        id: `lead-${r.id}`,
        group: 'quotes_needed',
        title: `New enquiry — ${[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown'}`,
        subtitle: `${r.address || 'No address'} · ${r.suburb || ''} · ${r.service_type || 'Service TBC'}`,
        timestamp: r.created_at,
        path: `/quoting?lead=${r.id}`,
        meta: { leadId: r.id },
      }));
    },
    enabled: isAdmin,
  });

  // Merge both sources into quotesNeeded
  const quotesNeeded = [...quoteRequestItems, ...leadItems].sort(
    (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  );

  // GROUP 2: Awaiting Client Response (quote sent, waiting for YES/NO)
  const { data: awaitingResponse = [] } = useQuery({
    queryKey: ['actions-awaiting-response'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quotes')
        .select('id, client_name, client_phone, property_address, property_name, clean_type, quote_sent_at, created_at')
        .eq('status', 'quote_sent')
        .order('quote_sent_at', { ascending: true });
      return (data || []).map((q: any) => ({
        id: `ar-${q.id}`,
        group: 'awaiting_response',
        title: `Quote sent — awaiting response · ${q.client_name || 'Client'}`,
        subtitle: `${q.property_address || q.property_name || ''} · ${q.clean_type || ''}`.trim(),
        timestamp: q.quote_sent_at || q.created_at,
        path: `/quoting?lead=${q.id}`,
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 3a: Pending Schedule Approval (from jobs)
  const { data: awaitingScheduleJobs = [] } = useQuery({
    queryKey: ['actions-awaiting-schedule'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, created_at, status, notes, price_inc_gst, linked_quote_id, properties(property_name, address, client_name)')
        .eq('status', 'awaiting_schedule_approval')
        .order('created_at', { ascending: true });
      return (data || []).map((j: any) => {
        const notesStr = j.notes || '';
        const timePrefMatch = notesStr.match(/Client preferred time: (\w+)/);
        const freqMatch = notesStr.match(/Frequency: (\w+)/);
        return {
          id: `as-${j.id}`,
          group: 'awaiting_schedule',
          title: `Client selected date — ${(j.properties as any)?.client_name || (j.properties as any)?.property_name || 'Client'}`,
          subtitle: `${(j.properties as any)?.address || ''} · ${j.scheduled_date || ''}`.trim(),
          timestamp: j.created_at,
          path: undefined,
          meta: {
            jobId: j.id,
            scheduledDate: j.scheduled_date,
            scheduledTime: j.scheduled_time,
            propertyName: (j.properties as any)?.property_name,
            propertyAddress: (j.properties as any)?.address,
            clientName: (j.properties as any)?.client_name,
            timePreference: timePrefMatch?.[1] || '',
            frequency: freqMatch?.[1] || 'one_off',
            priceIncGst: j.price_inc_gst,
            linkedQuoteId: j.linked_quote_id,
          },
        };
      });
    },
    enabled: isAdmin,
  });

  // GROUP 3b: Confirm Clean Date — accepted quote_requests (client booked via /book page)
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
        subtitle: `${r.address || 'No address'} · ${r.clean_type || ''} · ${r.preferred_date || ''}`.trim(),
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

  const awaitingSchedule = [...awaitingScheduleJobs].sort(
    (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  );

  // GROUP 4: Unread Messages
  const { data: unreadMessages = [] } = useQuery({
    queryKey: ['actions-unread-messages'],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_messages')
        .select('id, client_id, message, sent_at')
        .eq('direction', 'inbound')
        .is('read_at', null)
        .order('sent_at', { ascending: false })
        .limit(20);
      return (data || []).map((m: any) => ({
        id: `msg-${m.id}`,
        group: 'unread_messages',
        title: 'Unread client message',
        subtitle: m.message?.slice(0, 80) || '',
        timestamp: m.sent_at,
        path: `/clients`,
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 5: Jobs In Progress today
  const { data: jobsInProgress = [] } = useQuery({
    queryKey: ['actions-jobs-in-progress', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, properties(property_name, address)')
        .eq('status', 'in_progress')
        .eq('scheduled_date', today);
      return (data || []).map((j: any) => ({
        id: `jip-${j.id}`,
        group: 'jobs_in_progress',
        title: `In progress — ${(j.properties as any)?.property_name || 'Job'}`,
        subtitle: (j.properties as any)?.address || '',
        timestamp: j.scheduled_date,
        path: `/schedule`,
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 6: Completed Today
  const { data: completedToday = [] } = useQuery({
    queryKey: ['actions-completed-today', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, status, properties(property_name, address)')
        .eq('status', 'completed')
        .eq('scheduled_date', today);
      return (data || []).map((j: any) => ({
        id: `ct-${j.id}`,
        group: 'completed_today',
        title: `Completed — ${(j.properties as any)?.property_name || 'Job'}`,
        subtitle: (j.properties as any)?.address || '',
        timestamp: j.scheduled_date,
        path: `/jobs/${j.id}`,
      }));
    },
    enabled: isAdmin,
  });

  const totalCount =
    quotesNeeded.length +
    awaitingResponse.length +
    confirmCleanDate.length +
    awaitingSchedule.length +
    unreadMessages.length +
    jobsInProgress.length +
    completedToday.length;

  return {
    quotesNeeded,
    awaitingResponse,
    confirmCleanDate,
    awaitingSchedule,
    unreadMessages,
    jobsInProgress,
    completedToday,
    totalCount,
    isAdmin,
  };
}
