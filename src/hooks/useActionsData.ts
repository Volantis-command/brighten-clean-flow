import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, addDays, addHours } from 'date-fns';

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
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const in48h = format(addDays(new Date(), 2), 'yyyy-MM-dd');

  // GROUP 1: Urgent — jobs with check-in today/tomorrow, unassigned <48h, declined jobs
  const { data: urgentJobs = [] } = useQuery({
    queryKey: ['actions-urgent', today, tomorrow, in48h],
    queryFn: async () => {
      // Unassigned jobs within 48 hours
      const { data: unassigned } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, properties(property_name, address, guest_checkin_at)')
        .is('cleaner_1_id', null)
        .in('status', ['scheduled'])
        .gte('scheduled_date', today)
        .lte('scheduled_date', in48h);

      // Jobs with guest check-in today or tomorrow
      const { data: checkinJobs } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, properties(property_name, address, guest_checkin_at)')
        .in('scheduled_date', [today, tomorrow])
        .in('status', ['scheduled', 'in_progress']);

      // Declined acceptances
      const { data: declined } = await supabase
        .from('job_acceptances')
        .select('id, job_id, cleaner_id, responded_at, jobs(scheduled_date, properties(property_name))')
        .eq('acceptance_status', 'declined');

      const items: ActionItem[] = [];

      (checkinJobs || []).forEach((j: any) => {
        if (j.properties?.guest_checkin_at) {
          items.push({
            id: `urgent-checkin-${j.id}`,
            group: 'urgent',
            title: `Guest check-in ${j.scheduled_date === today ? 'today' : 'tomorrow'} — ${j.properties.property_name}`,
            subtitle: j.properties.address,
            timestamp: j.scheduled_date,
            path: `/jobs/${j.id}`,
          });
        }
      });

      (unassigned || []).forEach((j: any) => {
        items.push({
          id: `urgent-unassigned-${j.id}`,
          group: 'urgent',
          title: `No cleaner assigned — ${(j.properties as any)?.property_name || 'Job'}`,
          subtitle: `Scheduled ${j.scheduled_date}`,
          timestamp: j.scheduled_date,
          path: `/jobs/${j.id}`,
        });
      });

      (declined || []).forEach((a: any) => {
        items.push({
          id: `urgent-declined-${a.id}`,
          group: 'urgent',
          title: `Cleaner declined — ${(a.jobs as any)?.properties?.property_name || 'Job'}`,
          subtitle: 'Needs reassignment',
          timestamp: a.responded_at,
          path: `/jobs/${a.job_id}`,
        });
      });

      return items;
    },
    enabled: isAdmin,
  });

  // GROUP 2: New Enquiries — onboarded properties with no jobs yet (need quote)
  const { data: newEnquiries = [] } = useQuery({
    queryKey: ['actions-new-enquiries'],
    queryFn: async () => {
      // Get all onboarded client_properties
      const { data: onboarded } = await supabase
        .from('client_properties')
        .select('id, client_id, property_id, created_at, properties(property_name, address, client_name, bedrooms, bathrooms)')
        .eq('onboard_used', true);

      if (!onboarded?.length) return [];

      // Get property IDs that already have jobs
      const propertyIds = onboarded.map((cp: any) => cp.property_id);
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('property_id')
        .in('property_id', propertyIds);

      // Also check if a quote has been sent for these properties
      const { data: existingQuotes } = await supabase
        .from('quotes')
        .select('property_id')
        .in('property_id', propertyIds)
        .not('quote_sent_at', 'is', null);

      const propsWithJobs = new Set((existingJobs || []).map((j: any) => j.property_id));
      const propsWithQuotes = new Set((existingQuotes || []).map((q: any) => q.property_id));

      return onboarded
        .filter((cp: any) => !propsWithJobs.has(cp.property_id) && !propsWithQuotes.has(cp.property_id))
        .map((cp: any) => ({
          id: `enquiry-${cp.id}`,
          group: 'new_enquiries',
          title: `New enquiry — ${(cp.properties as any)?.client_name || 'Client'}`,
          subtitle: `${(cp.properties as any)?.property_name || ''} · ${(cp.properties as any)?.address || ''}`.trim(),
          timestamp: cp.created_at,
          path: `/quoting`,
          meta: { propertyId: cp.property_id, clientPropertyId: cp.id },
        }));
    },
    enabled: isAdmin,
  });

  // GROUP 3: Awaiting Quote (jobs)
  const { data: awaitingQuote = [] } = useQuery({
    queryKey: ['actions-awaiting-quote'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, created_at, status, notes, properties(property_name, address, client_name, client_type)')
        .eq('status', 'awaiting_quote')
        .order('created_at', { ascending: true });
      return (data || []).map((j: any) => ({
        id: `aq-${j.id}`,
        group: 'awaiting_quote',
        title: `${(j.properties as any)?.client_name || (j.properties as any)?.property_name || 'Unknown'} — needs quote`,
        subtitle: `${(j.properties as any)?.property_name || ''} ${(j.properties as any)?.address ? '· ' + (j.properties as any).address : ''}`.trim(),
        timestamp: j.created_at,
        path: `/jobs/${j.id}`,
        meta: { jobId: j.id },
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 4: Awaiting Client Response (quote sent, waiting for YES/NO)
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
        path: '/quoting',
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 5: Awaiting Approval
  const { data: awaitingApproval = [] } = useQuery({
    queryKey: ['actions-awaiting-approval'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, created_at, status, properties(property_name, address, client_name)')
        .eq('status', 'awaiting_approval')
        .order('created_at', { ascending: true });
      return (data || []).map((j: any) => ({
        id: `aa-${j.id}`,
        group: 'awaiting_approval',
        title: `${(j.properties as any)?.client_name || (j.properties as any)?.property_name || 'Unknown'} — confirm booking`,
        subtitle: (j.properties as any)?.address || '',
        timestamp: j.created_at,
        path: `/jobs/${j.id}`,
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 4: Pending Booking Requests
  const { data: bookingRequests = [] } = useQuery({
    queryKey: ['actions-booking-requests'],
    queryFn: async () => {
      const { data } = await supabase
        .from('clean_requests')
        .select('id, client_id, property_id, requested_date, clean_type, created_at, properties(property_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      return (data || []).map((r: any) => ({
        id: `br-${r.id}`,
        group: 'booking_requests',
        title: `Booking request — ${(r.properties as any)?.property_name || 'Property'}`,
        subtitle: `${r.clean_type || 'Clean'} · ${r.requested_date || 'No date'}`,
        timestamp: r.created_at,
        path: '/requests',
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 5: Unread Messages
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

  // GROUP 6: Onboarding Not Sent
  const { data: onboardingNotSent = [] } = useQuery({
    queryKey: ['actions-onboarding-unsent'],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_properties')
        .select('id, client_id, property_id, created_at, properties(property_name, client_name)')
        .eq('onboard_used', false)
        .is('onboarding_sent_at', null);
      return (data || []).map((cp: any) => ({
        id: `onboard-${cp.id}`,
        group: 'onboarding_unsent',
        title: `Onboarding not sent — ${(cp.properties as any)?.client_name || (cp.properties as any)?.property_name || 'Client'}`,
        subtitle: (cp.properties as any)?.property_name || '',
        timestamp: cp.created_at,
        path: `/clients`,
      }));
    },
    enabled: isAdmin,
  });

  // GROUP 7: New Feedback
  const { data: newFeedback = [] } = useQuery({
    queryKey: ['actions-new-feedback'],
    queryFn: async () => {
      const { data } = await supabase
        .from('job_feedback')
        .select('id, score, created_at, property_id, properties(property_name)')
        .order('created_at', { ascending: false })
        .limit(10);
      return (data || []).map((f: any) => ({
        id: `fb-${f.id}`,
        group: 'new_feedback',
        title: `New feedback — ${(f.properties as any)?.property_name || 'Property'}`,
        subtitle: f.score ? `Rating: ${f.score}/5` : 'No rating',
        timestamp: f.created_at,
      }));
    },
    enabled: isAdmin,
  });

  const totalCount =
    urgentJobs.length +
    newEnquiries.length +
    awaitingQuote.length +
    awaitingApproval.length +
    bookingRequests.length +
    unreadMessages.length +
    onboardingNotSent.length +
    newFeedback.length;

  return {
    urgentJobs,
    newEnquiries,
    awaitingQuote,
    awaitingApproval,
    bookingRequests,
    unreadMessages,
    onboardingNotSent,
    newFeedback,
    totalCount,
    isAdmin,
  };
}
