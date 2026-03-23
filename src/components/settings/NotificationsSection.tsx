import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

const notificationLabels: Record<string, string> = {
  notify_admin_job_completed: 'Notify admin when job is completed',
  notify_admin_qc_fails: 'Notify admin when QC fails',
  notify_cleaner_before_job: 'Notify cleaner 1 hour before job start',
  notify_admin_clock_in: 'Notify admin when cleaner clocks in',
  notify_admin_clock_out: 'Notify admin when cleaner clocks out',
  send_google_review_sms: 'Send Google review SMS after job completion',
  send_rebook_sms: 'Send re-booking SMS after one-off jobs',
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

  const { data: appSettings, isLoading: loadingApp } = useQuery({
    queryKey: ['app-settings-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((r) => { map[r.key] = r.value; });
      return map;
    },
  });

  const [reviewUrl, setReviewUrl] = useState('');
  const [reviewDelay, setReviewDelay] = useState('2');
  const [rebookDelay, setRebookDelay] = useState('24');

  useEffect(() => {
    if (appSettings) {
      setReviewUrl(appSettings['google_review_url'] || '');
      setReviewDelay(appSettings['review_sms_delay_hours'] || '2');
      setRebookDelay(appSettings['rebook_sms_delay_hours'] || '24');
    }
  }, [appSettings]);

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

  const [savingSmsSettings, setSavingSmsSettings] = useState(false);
  const handleSaveSmsSettings = async () => {
    setSavingSmsSettings(true);
    const entries = [
      { key: 'google_review_url', value: reviewUrl },
      { key: 'review_sms_delay_hours', value: reviewDelay },
      { key: 'rebook_sms_delay_hours', value: rebookDelay },
    ];
    for (const { key, value } of entries) {
      await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
    }
    toast.success('SMS settings saved');
    queryClient.invalidateQueries({ queryKey: ['app-settings-notifications'] });
    setSavingSmsSettings(false);
  };

  if (isLoading || loadingApp) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary">Notifications</h2>
        <p className="text-sm text-muted-foreground">Configure which notifications are sent.</p>
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

      <div>
        <h2 className="text-lg font-bold text-primary">Post-Job SMS Settings</h2>
        <p className="text-sm text-muted-foreground">Configure review and re-booking SMS messages sent after job completion.</p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
        <div>
          <Label className="text-sm font-semibold">Google Review URL</Label>
          <Input
            value={reviewUrl}
            onChange={(e) => setReviewUrl(e.target.value)}
            placeholder="https://g.page/r/your-business/review"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">Paste your Google Business review link here</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-semibold">Review SMS delay (hours)</Label>
            <Input
              type="number"
              min="0.5"
              step="0.5"
              value={reviewDelay}
              onChange={(e) => setReviewDelay(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-semibold">Re-booking SMS delay (hours)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={rebookDelay}
              onChange={(e) => setRebookDelay(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <Button
          onClick={handleSaveSmsSettings}
          disabled={savingSmsSettings}
          className="bg-primary text-primary-foreground font-bold rounded-xl gap-2"
        >
          {savingSmsSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save SMS Settings
        </Button>
      </div>
    </div>
  );
}
