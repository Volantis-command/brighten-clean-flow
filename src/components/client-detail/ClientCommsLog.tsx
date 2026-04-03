import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface Props {
  clientId?: string;
  jobId?: string;
  title?: string;
  limit?: number;
}

export default function ClientCommsLog({ clientId, jobId, title, limit = 50 }: Props) {
  const navigate = useNavigate();

  const { data: comms = [] } = useQuery({
    queryKey: ['client-comms', clientId, jobId],
    queryFn: async () => {
      let query = supabase
        .from('client_comms')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);

      if (clientId) query = query.eq('client_id', clientId);
      if (jobId) query = query.eq('job_id', jobId);

      const { data } = await query;
      if (!data?.length) return [];

      // Fetch sender names
      const senderIds = [...new Set(data.map(c => (c as any).sent_by).filter(Boolean))] as string[];
      const { data: profiles } = senderIds.length
        ? await supabase.from('profiles').select('id, full_name').in('id', senderIds)
        : { data: [] };
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Staff'; });

      return data.map((c: any) => ({
        ...c,
        sender_name: c.sent_by ? (nameMap[c.sent_by] || 'Staff') : 'System',
      }));
    },
    enabled: !!(clientId || jobId),
  });

  const heading = title || 'Communication History';

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <h3 className="font-bold text-foreground">{heading}</h3>
      {comms.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No messages sent yet.</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {comms.map((c: any) => (
            <div key={c.id} className="bg-muted rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{c.sender_name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {c.sent_at ? format(new Date(c.sent_at), "d MMM yyyy, h:mma") : ''}
                </span>
              </div>
              <p className="text-sm text-foreground font-mono whitespace-pre-wrap">{c.message_body}</p>
              {c.job_id && !jobId && (
                <button
                  onClick={() => navigate(`/jobs/${c.job_id}`)}
                  className="text-xs text-primary font-bold hover:underline"
                >
                  View Job →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
