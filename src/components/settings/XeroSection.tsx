import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ExternalLink, RefreshCw, Unplug, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function XeroSection() {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Poll for connection status
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['xero-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('xero-oauth-callback', {
        body: null,
        method: 'GET',
      });
      // Use query params approach
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-oauth-callback?action=status`,
        { headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` } }
      );
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Listen for OAuth completion message
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === 'xero_connected') {
        refetchStatus();
        toast.success('Xero connected successfully!');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refetchStatus]);

  // Xero settings
  const { data: settings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['xero-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('xero_settings').select('*');
      if (error) throw error;
      return data || [];
    },
  });

  const settingsMap: Record<string, string> = {};
  settings.forEach((s: any) => { settingsMap[s.key] = s.value; });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase.from('xero_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['xero-settings'] }),
  });

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-oauth-callback?action=get_auth_url`,
        { headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` } }
      );
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.open(url, '_blank', 'width=600,height=700');
    } catch (err: any) {
      toast.error('Failed to start connection: ' + err.message);
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-oauth-callback?action=disconnect`,
        { 
          method: 'POST',
          headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
        }
      );
      refetchStatus();
      toast.success('Xero disconnected');
    } catch (err: any) {
      toast.error(err.message);
    }
    setDisconnecting(false);
  };

  const handleRefresh = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-refresh-token`,
        { 
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success('Token refreshed');
      refetchStatus();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const isConnected = status?.connected;

  const settingFields = [
    { key: 'account_code_turnover', label: 'Turnover Clean Account Code', type: 'text' },
    { key: 'account_code_deep_clean', label: 'Deep Clean Account Code', type: 'text' },
    { key: 'account_code_end_of_lease', label: 'End of Lease Account Code', type: 'text' },
    { key: 'account_code_post_build', label: 'Post-Build Account Code', type: 'text' },
    { key: 'account_code_default', label: 'Default Account Code', type: 'text' },
    { key: 'invoice_prefix', label: 'Invoice Prefix', type: 'text' },
    { key: 'due_days', label: 'Due Days', type: 'number' },
    { key: 'default_line_description', label: 'Default Line Description', type: 'text' },
  ];

  return (
    <div className="space-y-6 mt-4">
      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#13B5EA' }}>
              <span className="text-white font-extrabold text-sm">X</span>
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Xero Integration</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm text-muted-foreground">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isConnected && status?.org_name && (
            <p className="text-sm text-foreground font-medium">Organisation: {status.org_name}</p>
          )}
          {isConnected && status?.last_synced && (
            <p className="text-xs text-muted-foreground">Last synced: {new Date(status.last_synced).toLocaleString()}</p>
          )}

          <div className="flex gap-2 flex-wrap">
            {!isConnected ? (
              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="gap-2 font-bold"
                style={{ backgroundColor: '#13B5EA' }}
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Connect Xero
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting} className="gap-2">
                  <Unplug className="h-4 w-4" /> Disconnect
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings - only show when connected or always for config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Account Code Mappings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingFields.map(({ key, label, type }) => (
            <div key={key} className="grid grid-cols-2 gap-3 items-center">
              <Label className="text-sm">{label}</Label>
              <Input
                type={type}
                value={settingsMap[key] || ''}
                onChange={(e) => updateSetting.mutate({ key, value: e.target.value })}
                className="h-9"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Tax Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 items-center">
            <Label className="text-sm">Sales Tax Type</Label>
            <Select
              value={settingsMap['sales_tax_type'] || 'GST on Income'}
              onValueChange={(v) => updateSetting.mutate({ key: 'sales_tax_type', value: v })}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GST on Income">GST on Income</SelectItem>
                <SelectItem value="Tax Exclusive">Tax Exclusive</SelectItem>
                <SelectItem value="No Tax">No Tax</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Auto-create draft invoice on job completion</Label>
            <Switch
              checked={settingsMap['auto_create_invoice'] === 'true'}
              onCheckedChange={(v) => updateSetting.mutate({ key: 'auto_create_invoice', value: v ? 'true' : 'false' })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Auto-create Xero contact for new properties</Label>
            <Switch
              checked={settingsMap['auto_create_contact'] === 'true'}
              onCheckedChange={(v) => updateSetting.mutate({ key: 'auto_create_contact', value: v ? 'true' : 'false' })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800 font-medium">
          ⚠️ Changing settings here affects all new invoices. Existing invoices in Xero are not modified.
        </p>
      </div>
    </div>
  );
}
