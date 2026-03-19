import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTimeEntry(jobId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ['time-entry', jobId, userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('time_entries')
        .select('id, clock_in_time, clock_out_time, total_minutes, geo_override, geo_distance_meters')
        .eq('job_id', jobId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!jobId,
  });
}
