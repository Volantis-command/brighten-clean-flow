import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DangerZoneSection from './DangerZoneSection';
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
          <Input type="email" value={form.company_email || ''} onChange={(e) => update('company_email', e.target.value)} placeholder="brendan@brightly.cleaning" />
        </div>
        <div>
          <Label>Secondary Contact Email</Label>
          <Input
            type="email"
            value={form.secondary_contact_email || ''}
            onChange={(e) => update('secondary_contact_email', e.target.value)}
            placeholder="soki@brightly.cleaning"
            pattern="[^@\s]+@[^@\s]+\.[^@\s]+"
          />
          {form.secondary_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.secondary_contact_email) && (
            <p className="text-xs text-destructive mt-1">Please enter a valid email address</p>
          )}
        </div>
        <div>
          <Label>Secondary Contact Phone</Label>
          <Input value={form.secondary_contact_phone || ''} onChange={(e) => update('secondary_contact_phone', e.target.value)} placeholder="0426 702 883" />
        </div>
        <div>
          <Label>Deposit Amount ($)</Label>
          <Input
            type="number"
            min="0"
            step="5"
            value={form.deposit_amount || '50'}
            onChange={(e) => update('deposit_amount', e.target.value)}
            placeholder="50"
          />
          <p className="text-xs text-muted-foreground mt-1">Required deposit for new bookings. Set to 0 to disable.</p>
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
          <Label>Google Review URL</Label>
          <Input
            type="url"
            value={form.google_review_url || ''}
            onChange={(e) => update('google_review_url', e.target.value)}
            placeholder="https://g.page/r/your-business/review"
          />
          <p className="text-xs text-muted-foreground mt-1">Used in post-clean feedback SMS when clients rate 4-5 stars</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Pre-Service Reminders</Label>
            <p className="text-xs text-muted-foreground">Send SMS reminders to clients (24h) and cleaners (2h) before jobs</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.reminders_enabled !== 'false'}
            onClick={() => update('reminders_enabled', form.reminders_enabled === 'false' ? 'true' : 'false')}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.reminders_enabled === 'false' ? 'bg-muted' : 'bg-primary'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition-transform ${form.reminders_enabled === 'false' ? 'translate-x-0' : 'translate-x-5'}`} />
          </button>
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
          onClick={() => {
            if (form.secondary_contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.secondary_contact_email)) {
              toast.error('Secondary contact email is not a valid email address');
              return;
            }
            saveMutation.mutate();
          }}
          disabled={saveMutation.isPending}
          className="bg-primary text-primary-foreground font-bold rounded-xl gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </Button>

        <div className="mt-6 p-4 bg-[hsl(45,100%,51%)]/10 border border-[hsl(45,100%,51%)]/30 rounded-xl">
          <p className="text-sm font-bold text-foreground mb-1">📱 SMS Webhook Setup</p>
          <p className="text-xs text-muted-foreground">
            To enable SMS replies from cleaners, configure your Twilio phone number's inbound webhook URL to:
          </p>
          <code className="block mt-2 text-xs bg-muted p-2 rounded-lg break-all select-all">
            {import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-inbound-sms
          </code>
        </div>
      </div>

      <DangerZoneSection />
    </div>
  );
}
