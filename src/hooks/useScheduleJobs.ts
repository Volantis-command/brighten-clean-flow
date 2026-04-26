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
  };

  return { jobs, isLoading, nameMap, acceptancesByJob, isAdmin, invalidate };
}
