import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface PendingChangesPanelProps {
  propertyId: string;
}

const FIELD_LABELS: Record<string, string> = {
  access_method: 'Access method',
  access_code: 'Access code',
  alarm_code: 'Alarm code',
  garage_code: 'Garage code',
  parking_notes: 'Parking notes',
  special_instructions: 'Special instructions',
  preferences_notes: 'Preferences',
};

export default function PendingChangesPanel({ propertyId }: PendingChangesPanelProps) {
  const queryClient = useQueryClient();
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['property-change-requests', propertyId, 'pending'],
    queryFn: async () => {
      const { data } = await supabase
        .from('property_change_requests' as any)
        .select('id, field_name, current_value, new_value, created_at, client_id')
        .eq('property_id', propertyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      return (data as any[]) || [];
    },
  });

  // Look up the client names for display
  const clientIds = [...new Set((requests as any[]).map((r: any) => r.client_id))];
  const { data: clientNames = {} } = useQuery({
    queryKey: ['property-change-clients', clientIds],
    queryFn: async () => {
      if (!clientIds.length) return {};
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', clientIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name || ''; });
      return map;
    },
    enabled: clientIds.length > 0,
  });

  const decide = async (requestId: string, decision: 'approved' | 'rejected') => {
    setDecidingId(requestId);
    try {
      const reason = decision === 'rejected'
        ? window.prompt('Reason for rejecting? (optional)') || undefined
        : undefined;
      const { data, error } = await supabase.functions.invoke('decide-property-change', {
        body: { request_id: requestId, decision, rejection_reason: reason },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(decision === 'approved' ? 'Change applied to property.' : 'Change rejected.');
      queryClient.invalidateQueries({ queryKey: ['property-change-requests', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['property-detail', propertyId] });
    } catch (e: any) {
      toast.error(e.message || 'Could not decide.');
    } finally {
      setDecidingId(null);
    }
  };

  if (isLoading) return null;
  if (!requests.length) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-amber-600" />
        <h4 className="font-bold text-amber-900 dark:text-amber-200">
          {requests.length} pending change{requests.length === 1 ? '' : 's'} from client
        </h4>
      </div>
      <div className="space-y-3">
        {(requests as any[]).map((r: any) => {
          const isThisDeciding = decidingId === r.id;
          return (
            <div key={r.id} className="rounded-xl bg-card border border-border p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    {FIELD_LABELS[r.field_name] || r.field_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {clientNames[r.client_id] || 'Client'} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => decide(r.id, 'approved')}
                    disabled={isThisDeciding}
                    className="gap-1 h-8"
                  >
                    {isThisDeciding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide(r.id, 'rejected')}
                    disabled={isThisDeciding}
                    className="gap-1 h-8"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Current</p>
                  <p className="text-foreground whitespace-pre-line">
                    {r.current_value || <span className="text-muted-foreground italic">empty</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Requested</p>
                  <p className="text-foreground font-semibold whitespace-pre-line">
                    {r.new_value || <span className="text-muted-foreground italic">empty</span>}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
