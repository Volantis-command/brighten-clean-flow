import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, ExternalLink, Unplug, Eye, EyeOff, Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const XERO_LOGO = (
  <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
    <rect width="32" height="32" rx="8" fill="#13B5EA" />
    <path d="M10 10l6 6m0 0l6-6m-6 6l-6 6m6-6l6 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export default function XeroSection() {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local form state for settings
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState('DRAFT');
  const [paymentTerms, setPaymentTerms] = useState('7');
  const [accountStandard, setAccountStandard] = useState('200');
  const [accountDeep, setAccountDeep] = useState('201');
  const [accountAirbnb, setAccountAirbnb] = useState('202');
  const [accountCommercial, setAccountCommercial] = useState('203');
  const [invoicePrefix, setInvoicePrefix] = useState('BCL-');

  // Connection status
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['xero-status'],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-oauth-callback?action=status`,
        { headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` } }
      );
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Listen for OAuth completion
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

  // Load settings from app_settings
  const { data: settings = [] } = useQuery({
    queryKey: ['xero-app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .like('key', 'xero_%');
      if (error) throw error;
      return data || [];
    },
  });

  // Hydrate local state from DB
  useEffect(() => {
    if (!settings.length) return;
    const map: Record<string, string> = {};
    settings.forEach((s: any) => { map[s.key] = s.value; });
    if (map.xero_auto_invoice !== undefined) setAutoInvoice(map.xero_auto_invoice === 'true');
    if (map.xero_auto_send !== undefined) setAutoSend(map.xero_auto_send === 'true');
    if (map.xero_invoice_status) setInvoiceStatus(map.xero_invoice_status);
    if (map.xero_default_payment_terms) setPaymentTerms(map.xero_default_payment_terms);
    if (map.xero_account_standard) setAccountStandard(map.xero_account_standard);
    if (map.xero_account_deep) setAccountDeep(map.xero_account_deep);
    if (map.xero_account_airbnb) setAccountAirbnb(map.xero_account_airbnb);
    if (map.xero_account_commercial) setAccountCommercial(map.xero_account_commercial);
    if (map.xero_invoice_prefix) setInvoicePrefix(map.xero_invoice_prefix);
  }, [settings]);

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
          headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        }
      );
      refetchStatus();
      toast.success('Xero disconnected');
    } catch (err: any) {
      toast.error(err.message);
    }
    setDisconnecting(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'xero_auto_invoice', value: autoInvoice ? 'true' : 'false' },
        { key: 'xero_auto_send', value: autoSend ? 'true' : 'false' },
        { key: 'xero_invoice_status', value: invoiceStatus },
        { key: 'xero_default_payment_terms', value: paymentTerms },
        { key: 'xero_account_standard', value: accountStandard },
        { key: 'xero_account_deep', value: accountDeep },
        { key: 'xero_account_airbnb', value: accountAirbnb },
        { key: 'xero_account_commercial', value: accountCommercial },
        { key: 'xero_invoice_prefix', value: invoicePrefix },
      ];

      for (const { key, value } of updates) {
        const { error } = await supabase
          .from('app_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['xero-app-settings'] });
      toast.success('Xero settings saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    }
    setSaving(false);
  };

  const isConnected = status?.connected;

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── STATE A: Not Connected ───
  if (!isConnected) {
    return (
      <div className="space-y-6 mt-4">
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-3">{XERO_LOGO}</div>
            <CardTitle className="text-xl">Connect Xero</CardTitle>
            <CardDescription className="text-sm mt-1">
              Automatically create invoices in Xero when jobs are completed. Keep your accounts in sync without manual data entry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full gap-2 font-bold text-white"
              style={{ backgroundColor: '#13B5EA' }}
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Connect to Xero
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Your Xero Client ID and Client Secret are stored as secure backend secrets.{' '}
              <a
                href="https://developer.xero.com/app/manage"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Get your Xero API credentials →
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── STATE B: Connected ───
  return (
    <div className="space-y-6 mt-4">
      {/* Connection Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            {XERO_LOGO}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Xero Integration</CardTitle>
                <Badge className="bg-brightly/10 text-brightly border-green-300 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              </div>
              {status?.org_name && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Organisation: <span className="font-medium text-foreground">{status.org_name}</span>
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="gap-2 border-destructive text-destructive hover:bg-destructive/10"
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
            Disconnect
          </Button>
        </CardContent>
      </Card>

      {/* Auto-Invoice Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Auto-Invoice Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-create invoice when job is marked Complete</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Creates a Xero invoice automatically on job completion</p>
            </div>
            <Switch checked={autoInvoice} onCheckedChange={setAutoInvoice} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-send invoice to client email</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Sends the invoice via Xero email on creation</p>
            </div>
            <Switch checked={autoSend} onCheckedChange={setAutoSend} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-sm font-medium">Invoice status</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Status for new invoices in Xero</p>
            </div>
            <Select value={invoiceStatus} onValueChange={setInvoiceStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SUBMITTED">Awaiting Approval</SelectItem>
                <SelectItem value="AUTHORISED">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-sm font-medium">Invoice prefix</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Prefix for invoice numbers (e.g. BCL-)</p>
            </div>
            <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} className="h-9" />
          </div>
        </CardContent>
      </Card>

      {/* Account Mapping */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Account Mapping</CardTitle>
          <CardDescription>Map service types to your Xero chart of accounts codes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 items-center">
            <Label className="text-sm">Standard House Clean</Label>
            <Select value={accountStandard} onValueChange={setAccountStandard}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200 — Sales</SelectItem>
                <SelectItem value="201">201 — Deep Clean Revenue</SelectItem>
                <SelectItem value="202">202 — Airbnb Revenue</SelectItem>
                <SelectItem value="203">203 — Commercial Revenue</SelectItem>
                <SelectItem value="207">207 — House Clean Revenue</SelectItem>
                <SelectItem value="260">260 — Other Revenue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <Label className="text-sm">Deep Clean</Label>
            <Select value={accountDeep} onValueChange={setAccountDeep}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200 — Sales</SelectItem>
                <SelectItem value="201">201 — Deep Clean Revenue</SelectItem>
                <SelectItem value="202">202 — Airbnb Revenue</SelectItem>
                <SelectItem value="203">203 — Commercial Revenue</SelectItem>
                <SelectItem value="207">207 — House Clean Revenue</SelectItem>
                <SelectItem value="260">260 — Other Revenue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <Label className="text-sm">Airbnb Turnover</Label>
            <Select value={accountAirbnb} onValueChange={setAccountAirbnb}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200 — Sales</SelectItem>
                <SelectItem value="201">201 — Deep Clean Revenue</SelectItem>
                <SelectItem value="202">202 — Airbnb Revenue</SelectItem>
                <SelectItem value="203">203 — Commercial Revenue</SelectItem>
                <SelectItem value="207">207 — House Clean Revenue</SelectItem>
                <SelectItem value="260">260 — Other Revenue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <Label className="text-sm">Commercial Clean</Label>
            <Select value={accountCommercial} onValueChange={setAccountCommercial}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200 — Sales</SelectItem>
                <SelectItem value="201">201 — Deep Clean Revenue</SelectItem>
                <SelectItem value="202">202 — Airbnb Revenue</SelectItem>
                <SelectItem value="203">203 — Commercial Revenue</SelectItem>
                <SelectItem value="207">207 — House Clean Revenue</SelectItem>
                <SelectItem value="260">260 — Other Revenue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-sm font-medium">Default payment terms (days)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Due date = invoice date + this many days</p>
            </div>
            <Input
              type="number"
              min={1}
              max={90}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="h-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={handleSaveSettings} disabled={saving} className="gap-2 w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Settings
      </Button>

      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800 font-medium">
          ⚠️ Changing settings here affects all new invoices. Existing invoices in Xero are not modified.
        </p>
      </div>
    </div>
  );
}
