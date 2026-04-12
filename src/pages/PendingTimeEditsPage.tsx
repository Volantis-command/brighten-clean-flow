import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useState } from 'react';

export default function PendingTimeEditsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const { data: edits = [], isLoading } = useQuery({
    queryKey: ['pending-time-edits'],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_edit_queue' as any)
        .select('*, time_entries(id, clock_in_time, clock_out_time, job_id, user_id)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (!data?.length) return [];
      const userIds = [...new Set((data as any[]).map(e => e.requested_by).filter(Boolean))];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
      return (data as any[]).map(e => ({ ...e, requester_name: nameMap[e.requested_by] || 'Unknown' }));
    },
  });

  const handleDecision = async (editId: string, approve: boolean, edit: any) => {
    setProcessing(p => new Set(p).add(editId));
    try {
      if (approve && edit.time_entries) {
        const updates: any = {};
        if (edit.proposed_clock_on) updates.clock_in_time = edit.proposed_clock_on;
        if (edit.proposed_clock_off) updates.clock_out_time = edit.proposed_clock_off;
        if (updates.clock_in_time && (updates.clock_out_time || edit.time_entries.clock_out_time)) {
          const cin = new Date(updates.clock_in_time || edit.time_entries.clock_in_time);
          const cout = new Date(updates.clock_out_time || edit.time_entries.clock_out_time);
          updates.total_minutes = Math.round((cout.getTime() - cin.getTime()) / 60000);
        }
        const { error: teError } = await supabase.from('time_entries').update(updates).eq('id', edit.time_entry_id);
        if (teError) { toast.error('Failed to update time entry: ' + teError.message); return; }
      }
      const { error: qError } = await (supabase.from('time_edit_queue' as any) as any).update({
        status: approve ? 'approved' : 'denied',
        decided_by: user?.id,
        decided_at: new Date().toISOString(),
      }).eq('id', editId);
      if (qError) { toast.error('Failed to update edit queue: ' + qError.message); return; }
      toast.success(approve ? 'Time edit approved' : 'Time edit denied');
      queryClient.invalidateQueries({ queryKey: ['pending-time-edits'] });
    } catch (err: any) {
      toast.error(err.message);
    }
    setProcessing(p => { const n = new Set(p); n.delete(editId); return n; });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-extrabold text-primary">Pending Time Edits</h1>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : edits.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">No pending time edits.</div>
      ) : (
        <div className="space-y-3">
          {edits.map((edit: any) => (
            <div key={edit.id} className="bg-card rounded-2xl border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold text-foreground">{edit.requester_name}</p>
                <Badge variant="outline">Pending</Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                {edit.proposed_clock_on && (
                  <p>New clock-in: <span className="font-mono text-foreground">{format(new Date(edit.proposed_clock_on), 'HH:mm')}</span></p>
                )}
                {edit.proposed_clock_off && (
                  <p>New clock-out: <span className="font-mono text-foreground">{format(new Date(edit.proposed_clock_off), 'HH:mm')}</span></p>
                )}
                {edit.time_entries && (
                  <p className="text-xs">Original: {edit.time_entries.clock_in_time ? format(new Date(edit.time_entries.clock_in_time), 'HH:mm') : '–'} → {edit.time_entries.clock_out_time ? format(new Date(edit.time_entries.clock_out_time), 'HH:mm') : '–'}</p>
                )}
                {edit.reason && <p>Reason: {edit.reason}</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="bg-brightly hover:bg-brightly-hover text-white gap-1" disabled={processing.has(edit.id)} onClick={() => handleDecision(edit.id, true, edit)}>
                  {processing.has(edit.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
                </Button>
                <Button size="sm" variant="outline" className="text-destructive border-destructive gap-1" disabled={processing.has(edit.id)} onClick={() => handleDecision(edit.id, false, edit)}>
                  <X className="h-3 w-3" /> Deny
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
