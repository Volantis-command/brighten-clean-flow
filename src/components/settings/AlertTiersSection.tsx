import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TIER_META: Record<string, { label: string; desc: string; color: string }> = {
  critical: { label: 'Critical', desc: 'Phone SMS to admin', color: 'bg-destructive/10 text-destructive' },
  important: { label: 'Important', desc: 'In-app notification only', color: 'bg-amber-500/10 text-amber-500' },
  info: { label: 'Info', desc: 'Feed only', color: 'bg-primary/10 text-primary' },
};

const EVENT_LABELS: Record<string, string> = {
  damage_reported: 'Damage Reported',
  cleaner_no_show: 'Cleaner No-Show',
  access_failure: 'Access Failure',
  geofence_override: 'Geofence Override',
  quote_needs_approval: 'Quote Needs Approval',
  booking_needs_assignment: 'Booking Needs Assignment',
  time_edit_pending: 'Time Edit Pending',
  quote_expiring_48h: 'Quote Expiring (48h)',
  qc_below_80: 'QC Below 80%',
  cleaner_rejected_job: 'Cleaner Rejected Job',
  quote_accepted: 'Quote Accepted',
  job_completed: 'Job Completed',
  clock_on: 'Clock On',
  clock_off: 'Clock Off',
  new_client: 'New Client',
  review_5_star: '5-Star Review',
};

export default function AlertTiersSection() {
  const queryClient = useQueryClient();

  const { data: tiers, isLoading } = useQuery({
    queryKey: ['alert-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alert_tiers' as any)
        .select('*')
        .order('tier');
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await (supabase.from('alert_tiers' as any) as any)
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alert-tiers'] }),
    onError: () => toast.error('Failed to update'),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const grouped: Record<string, any[]> = { critical: [], important: [], info: [] };
  (tiers || []).forEach((t: any) => {
    if (grouped[t.tier]) grouped[t.tier].push(t);
  });

  return (
    <div className="space-y-4 mt-6">
      <h3 className="text-base font-bold text-foreground">Alert Tiers</h3>
      <p className="text-xs text-muted-foreground">Configure which events trigger alerts and at what priority level.</p>

      {Object.entries(grouped).map(([tier, events]) => {
        const meta = TIER_META[tier];
        return (
          <div key={tier} className="bg-card rounded-2xl border border-border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Badge className={meta.color}>{meta.label}</Badge>
              <span className="text-xs text-muted-foreground">{meta.desc}</span>
            </div>
            <div className="space-y-2">
              {events.map((ev: any) => (
                <div key={ev.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-foreground">{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
                  <Switch
                    checked={ev.enabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: ev.id, enabled: checked })}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
