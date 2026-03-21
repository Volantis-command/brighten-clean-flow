import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const notificationLabels: Record<string, string> = {
  notify_admin_job_completed: 'Notify admin when job is completed',
  notify_admin_qc_fails: 'Notify admin when QC fails',
  notify_cleaner_before_job: 'Notify cleaner 1 hour before job start',
  notify_admin_clock_in: 'Notify admin when cleaner clocks in',
  notify_admin_clock_out: 'Notify admin when cleaner clocks out',
};

export default function NotificationsSection() {
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('key, enabled');
      if (error) throw error;
      return data || [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('notification_settings')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
    onError: () => toast.error('Failed to update'),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary">Notifications</h2>
        <p className="text-sm text-muted-foreground">Configure which notifications are sent. Push notifications can be wired later.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
        {settings.map((s) => (
          <div key={s.key} className="flex items-center justify-between">
            <Label className="text-sm font-medium cursor-pointer">{notificationLabels[s.key] || s.key}</Label>
            <Switch
              checked={s.enabled}
              onCheckedChange={(checked) => toggleMutation.mutate({ key: s.key, enabled: checked })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
