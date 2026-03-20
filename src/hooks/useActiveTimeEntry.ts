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

      const { data, error } = await supabase
        .from('time_entries')
        .select('id, job_id, clock_in_time, jobs(properties(property_name))')
        .eq('user_id', user.id)
        .not('clock_in_time', 'is', null)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      const jobData = data.jobs as any;
      const propertyName = jobData?.properties?.property_name || 'Unknown Property';

      return {
        id: data.id,
        job_id: data.job_id!,
        clock_in_time: data.clock_in_time!,
        propertyName,
      };
    },
    enabled: !!user,
    refetchInterval: 30000, // refresh every 30s
  });
}
