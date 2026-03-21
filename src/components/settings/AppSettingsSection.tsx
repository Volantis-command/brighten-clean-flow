import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

const timezones = [
  'Australia/Brisbane',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Darwin',
  'Australia/Hobart',
  'Pacific/Auckland',
];

export default function AppSettingsSection() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['app-settings'],
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

  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(form);
      for (const [key, value] of entries) {
        await supabase
          .from('app_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key);
      }
    },
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-primary">App Settings</h2>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
        <div>
          <Label>Company Name</Label>
          <Input value={form.company_name || ''} onChange={(e) => update('company_name', e.target.value)} />
        </div>
        <div>
          <Label>Company Phone</Label>
          <Input value={form.company_phone || ''} onChange={(e) => update('company_phone', e.target.value)} placeholder="07 1234 5678" />
        </div>
        <div>
          <Label>Company Email</Label>
          <Input type="email" value={form.company_email || ''} onChange={(e) => update('company_email', e.target.value)} placeholder="hello@brightly.com" />
        </div>
        <div>
          <Label>Default Job Duration (hours)</Label>
          <Input type="number" min="0.5" step="0.5" value={form.default_job_duration || '3'} onChange={(e) => update('default_job_duration', e.target.value)} />
        </div>
        <div>
          <Label>Geo-fence Radius (metres)</Label>
          <Input type="number" min="50" step="50" value={form.geofence_radius || '200'} onChange={(e) => update('geofence_radius', e.target.value)} />
        </div>
        <div>
          <Label>Timezone</Label>
          <Select value={form.timezone || 'Australia/Brisbane'} onValueChange={(v) => update('timezone', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="bg-primary text-primary-foreground font-bold rounded-xl gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
