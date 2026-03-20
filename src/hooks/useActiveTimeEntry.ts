import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ActiveTimeEntry {
  id: string;
  job_id: string;
  clock_in_time: string;
  propertyName: string;
}

export function useActiveTimeEntry() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['active-time-entry', user?.id],
    queryFn: async (): Promise<ActiveTimeEntry | null> => {
      if (!user) return null;

      // Step 1: get active time entry
      const { data: entry, error } = await supabase
        .from('time_entries')
        .select('id, job_id, clock_in_time')
        .eq('user_id', user.id)
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !entry || !entry.job_id) return null;

      // Step 2: get job with property name
      let propertyName = 'Unknown Property';
      const { data: job } = await supabase
        .from('jobs')
        .select('property_id, properties(property_name)')
        .eq('id', entry.job_id)
        .maybeSingle();

      if (job) {
        const props = job.properties as any;
        propertyName = props?.property_name || 'Unknown Property';
      }

      return {
        id: entry.id,
        job_id: entry.job_id,
        clock_in_time: entry.clock_in_time!,
        propertyName,
      };
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
}
