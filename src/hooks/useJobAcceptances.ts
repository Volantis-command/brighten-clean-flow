import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface JobAcceptance {
  id: string;
  job_id: string;
  cleaner_id: string;
  acceptance_status: string;
  sms_sent_at: string | null;
  responded_at: string | null;
}

export function useJobAcceptances(jobId: string | undefined) {
  return useQuery({
    queryKey: ['job-acceptances', jobId],
    queryFn: async () => {
      if (!jobId) return [];
      const { data, error } = await supabase
        .from('job_acceptances')
        .select('*')
        .eq('job_id', jobId);
      if (error) throw error;
      return (data || []) as JobAcceptance[];
    },
    enabled: !!jobId,
  });
}
