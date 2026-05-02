import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ScheduleJob {
  id: string;
  property_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  estimated_duration: number | null;
  cleaner_1_id: string | null;
  cleaner_2_id: string | null;
  status: string;
  price_ex_gst: number | null;
  price_inc_gst: number | null;
  notes: string | null;
  invoice_status: string | null;
  series_id: string | null;
  recurring_parent_id: string | null;
  is_urgent: boolean | null;
  frequency: string | null;
  source: string | null;
  // Fallback fields used by jobLabel() when properties.property_name is null
  client_name: string | null;
  property_address: string | null;
  properties: {
    property_name: string | null;
    client_name: string | null;
    address: string | null;
    suburb: string | null;
    lat: number | null;
    lng: number | null;
    client_type: string | null;
    first_clean: boolean | null;
  } | null;
  // Set to true for iCal booking suggestions shown on calendar before approval
  _isSuggestion?: boolean;
}

export interface CleanerProfile {
  id: string;
  full_name: string | null;
}

export interface JobAcceptance {
  job_id: string;
  cleaner_id: string;
  acceptance_status: string;
}

export function useScheduleJobs() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin' || role === 'head_cleaner';
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['schedule-jobs'],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*, properties(property_name, client_name, address, suburb, lat, lng, client_type, first_clean)')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (!isAdmin && user) {
        query = query.or(`cleaner_1_id.eq.${user.id},cleaner_2_id.eq.${user.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ScheduleJob[];
    },
    enabled: !!user,
  });

  // ── Pending iCal booking suggestions (admin only) ─────────────────
  // Shown on the calendar as orange "Needs Approval" blocks so nothing
  // slips through. Clicking navigates to /bookings/suggestions.
  const { data: suggestions = [] } = useQuery({
    queryKey: ['pending-booking-suggestions'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('booking_suggestions' as any)
        .select('id, property_id, checkout_date, suggested_clean_date, guest_name, properties(property_name, client_name, address, suburb, lat, lng, client_type, first_clean)')
        .eq('status', 'pending') as any);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user && isAdmin,
    refetchInterval: 5 * 60 * 1000, // re-check every 5 min
  });

  // Map suggestions → synthetic ScheduleJob entries
  const suggestionJobs: ScheduleJob[] = suggestions.map((s: any) => ({
    id: `suggestion-${s.id}`,
    property_id: s.property_id,
    // Show on the clean date (day after checkout). Fall back to checkout date.
    scheduled_date: s.suggested_clean_date || s.checkout_date,
    scheduled_time: null,
    estimated_duration: null,
    cleaner_1_id: null,
    cleaner_2_id: null,
    status: 'pending_suggestion',
    price_ex_gst: null,
    price_inc_gst: null,
    notes: s.guest_name ? `Guest: ${s.guest_name}` : 'iCal booking — tap to approve',
    invoice_status: null,
    series_id: null,
    recurring_parent_id: null,
    is_urgent: false,
    frequency: null,
    source: 'ical',
    client_name: null,
    property_address: null,
    properties: s.properties || null,
    _isSuggestion: true,
  }));

  // Merge: real jobs first, then suggestions (sorted by date in calendar views)
  const allJobs = [...jobs, ...suggestionJobs];

  const cleanerIds = [...new Set(jobs.flatMap(j => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))] as string[];

  const { data: profiles = [] } = useQuery({
    queryKey: ['schedule-profiles', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      if (error) throw error;
      return (data || []) as CleanerProfile[];
    },
    enabled: cleanerIds.length > 0,
  });

  const jobIds = jobs.map(j => j.id);

  const { data: allAcceptances = [] } = useQuery({
    queryKey: ['schedule-acceptances', jobIds],
    queryFn: async () => {
      if (jobIds.length === 0) return [];
      const { data, error } = await supabase
        .from('job_acceptances')
        .select('job_id, cleaner_id, acceptance_status')
        .in('job_id', jobIds);
      if (error) throw error;
      return (data || []) as JobAcceptance[];
    },
    enabled: jobIds.length > 0,
  });

  const nameMap: Record<string, string> = {};
  profiles.forEach(p => { nameMap[p.id] = p.full_name || 'Unknown'; });

  const acceptancesByJob: Record<string, { cleaner_id: string; cleaner_name: string; acceptance_status: string }[]> = {};
  allAcceptances.forEach(a => {
    if (!acceptancesByJob[a.job_id]) acceptancesByJob[a.job_id] = [];
    acceptancesByJob[a.job_id].push({
      cleaner_id: a.cleaner_id,
      cleaner_name: nameMap[a.cleaner_id] || 'Unknown',
      acceptance_status: a.acceptance_status,
    });
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['pending-booking-suggestions'] });
  };

  return { jobs: allJobs, isLoading, nameMap, acceptancesByJob, isAdmin, invalidate, pendingSuggestionCount: suggestions.length };
}
