import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';

interface Props {
  jobId: string;
  userId: string;
}

export function ExtraTimeBanner({ jobId, userId }: Props) {
  const queryClient = useQueryClient();

  const { data: entry } = useQuery({
    queryKey: ['extra-time-banner', jobId, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('id, extra_time_minutes, extra_time_status, extra_time_reason')
        .eq('job_id', jobId)
        .eq('user_id', userId)
        .not('extra_time_status', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    refetchInterval: 10_000,
  });

  // Realtime subscription for status changes
  useEffect(() => {
    const channel = supabase
      .channel(`extra-time-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'time_entries',
        filter: `job_id=eq.${jobId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['extra-time-banner', jobId, userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId, userId, queryClient]);

  if (!entry?.extra_time_status) return null;

  const status = entry.extra_time_status;
  const mins = entry.extra_time_minutes;

  return (
    <div className={`rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-bold ${
      status === 'pending' ? 'bg-amber-500/15 text-amber-700 border border-amber-500/30' :
      status === 'approved' ? 'bg-brightly/15 text-brightly border border-brightly/30' :
      'bg-destructive/15 text-destructive border border-destructive/30'
    }`}>
      <Clock className="h-4 w-4 shrink-0" />
      {status === 'pending' && `Extra time request pending (${mins}m)`}
      {status === 'approved' && `Approved +${mins}m`}
      {status === 'denied' && 'Extra time denied'}
    </div>
  );
}
