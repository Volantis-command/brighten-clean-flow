import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function GuestySection() {
  const queryClient = useQueryClient();

  const { data: settings = {} } = useQuery({
    queryKey: ['guesty-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', [
        'guesty_api_key', 'guesty_webhook_secret', 'guesty_auto_create',
      ]);
      const map: Record<string, string> = {};
      (data || []).forEach((s) => { map[s.key] = s.value; });
      return map;
    },
  });

  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [testing, setTesting] = useState(false);

  const hasApiKey = !!settings.guesty_api_key;
  const autoCreate = settings.guesty_auto_create === 'true';

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: existing } = await supabase.from('app_settings').select('id').eq('key', key).maybeSingle();
      if (existing) {
        await supabase.from('app_settings').update({ value }).eq('key', key);
      } else {
        await supabase.from('app_settings').insert({ key, value });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guesty-settings'] });
      toast.success('Setting saved');
    },
  });

  const toggleAutoCreate = () => {
    saveMutation.mutate({ key: 'guesty_auto_create', value: autoCreate ? 'false' : 'true' });
  };

  const saveApiKey = () => {
    if (apiKey.trim()) saveMutation.mutate({ key: 'guesty_api_key', value: apiKey.trim() });
  };

  const saveWebhookSecret = () => {
    if (webhookSecret.trim()) saveMutation.mutate({ key: 'guesty_webhook_secret', value: webhookSecret.trim() });
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('receive-guesty-webhook', {
        body: { action: 'test' },
      });
      if (error) throw error;
      toast.success('Guesty connection working!');
    } catch {
      toast.error('Connection test failed — check API key');
    }
    setTesting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-primary">Guesty Integration</h2>
          <p className="text-sm text-muted-foreground">Auto-create jobs from Guesty checkout events</p>
        </div>
        <div className="flex items-center gap-2">
          {hasApiKey ? (
            <span className="flex items-center gap-1 text-xs font-bold text-primary"><CheckCircle className="w-4 h-4" /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground"><XCircle className="w-4 h-4" /> Not configured</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">API Key</Label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasApiKey ? '••••••••••' : 'Enter Guesty API key'}
              className="h-12 rounded-xl flex-1"
            />
            <Button onClick={saveApiKey} disabled={!apiKey.trim()} className="rounded-xl">Save</Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Webhook Secret</Label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={settings.guesty_webhook_secret ? '••••••••••' : 'Enter webhook secret'}
              className="h-12 rounded-xl flex-1"
            />
            <Button onClick={saveWebhookSecret} disabled={!webhookSecret.trim()} className="rounded-xl">Save</Button>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
          <div>
            <p className="text-sm font-bold">Auto-create jobs from Guesty checkouts</p>
            <p className="text-xs text-muted-foreground">Automatically creates turnover jobs when Guesty sends checkout events</p>
          </div>
          <Switch checked={autoCreate} onCheckedChange={toggleAutoCreate} />
        </div>

        <div className="bg-muted rounded-xl p-4 space-y-2">
          <p className="text-sm font-bold">Webhook URL</p>
          <p className="text-xs text-muted-foreground break-all">
            {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receive-guesty-webhook`}
          </p>
          <p className="text-xs text-muted-foreground">Add this URL in your Guesty dashboard under Webhooks → New Webhook → Event: reservation.checkout</p>
        </div>

        <Button onClick={testConnection} variant="outline" disabled={testing} className="rounded-xl gap-2">
          {testing && <Loader2 className="w-4 h-4 animate-spin" />}
          Test Connection
        </Button>
      </div>
    </div>
  );
}
