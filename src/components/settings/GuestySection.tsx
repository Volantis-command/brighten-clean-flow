import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Unplug, Eye, EyeOff, Save, CheckCircle2, Link2 } from 'lucide-react';
import { toast } from 'sonner';

const GUESTY_LOGO = (
  <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
    <rect width="32" height="32" rx="8" fill="#FF6B35" />
    <text x="16" y="22" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="sans-serif">G</text>
  </svg>
);

export default function GuestySection() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [autoCreateJob, setAutoCreateJob] = useState(true);
  const [defaultCleanType, setDefaultCleanType] = useState('standard');
  const [bufferHours, setBufferHours] = useState('2');

  // Fetch guesty_config
  const { data: config, isLoading } = useQuery({
    queryKey: ['guesty-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guesty_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch properties for mapping
  const { data: properties = [] } = useQuery({
    queryKey: ['properties-for-guesty'],
    queryFn: async () => {
      const { data } = await supabase
        .from('properties')
        .select('id, property_name, guesty_listing_id')
        .eq('active', true)
        .order('property_name');
      return data || [];
    },
  });

  const isConnected = !!config?.api_key;

  useEffect(() => {
    if (!config) return;
    setAutoCreateJob(config.auto_create_job ?? true);
    setDefaultCleanType(config.default_clean_type || 'standard');
    setBufferHours(String(config.buffer_hours || 2));
  }, [config]);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }
    setConnecting(true);
    try {
      if (config?.id) {
        await supabase.from('guesty_config').update({
          api_key: apiKey.trim(),
          client_id: clientId.trim() || null,
          client_secret: clientSecret.trim() || null,
          account_name: 'Guesty Account',
          updated_at: new Date().toISOString(),
        }).eq('id', config.id);
      } else {
        await supabase.from('guesty_config').insert({
          api_key: apiKey.trim(),
          client_id: clientId.trim() || null,
          client_secret: clientSecret.trim() || null,
          account_name: 'Guesty Account',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['guesty-config'] });
      toast.success('Guesty connected!');
      setApiKey('');
      setClientId('');
      setClientSecret('');
    } catch (err: any) {
      toast.error('Failed to connect: ' + err.message);
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      if (config?.id) {
        await supabase.from('guesty_config').update({
          api_key: null,
          client_id: null,
          client_secret: null,
          access_token: null,
          refresh_token: null,
          account_name: null,
          updated_at: new Date().toISOString(),
        }).eq('id', config.id);
      }
      queryClient.invalidateQueries({ queryKey: ['guesty-config'] });
      toast.success('Guesty disconnected');
    } catch (err: any) {
      toast.error(err.message);
    }
    setDisconnecting(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      if (config?.id) {
        await supabase.from('guesty_config').update({
          auto_create_job: autoCreateJob,
          default_clean_type: defaultCleanType,
          buffer_hours: parseInt(bufferHours) || 2,
          updated_at: new Date().toISOString(),
        }).eq('id', config.id);
      }
      queryClient.invalidateQueries({ queryKey: ['guesty-config'] });
      toast.success('Guesty settings saved');
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    }
    setSaving(false);
  };

  if (isLoading) {
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
            <div className="flex justify-center mb-3">{GUESTY_LOGO}</div>
            <CardTitle className="text-xl">Connect Guesty</CardTitle>
            <CardDescription className="text-sm mt-1">
              Automatically create cleaning jobs from Guesty checkout events. Sync your short-stay properties effortlessly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter Guesty API key"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">OAuth Client ID <span className="text-muted-foreground">(optional)</span></Label>
              <div className="relative">
                <Input
                  type={showClientId ? 'text' : 'password'}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="OAuth Client ID"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowClientId(!showClientId)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">OAuth Client Secret <span className="text-muted-foreground">(optional)</span></Label>
              <div className="relative">
                <Input
                  type={showClientSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="OAuth Client Secret"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              onClick={handleConnect}
              disabled={connecting || !apiKey.trim()}
              className="w-full gap-2 font-bold text-white"
              style={{ backgroundColor: '#FF6B35' }}
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Connect to Guesty
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              <a
                href="https://www.guesty.com/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Get your Guesty API credentials →
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            {GUESTY_LOGO}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Guesty Integration</CardTitle>
                <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              </div>
              {config?.account_name && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Account: <span className="font-medium text-foreground">{config.account_name}</span>
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

      {/* Automations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Automations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-create cleaning job on checkout</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically creates a turnover job when Guesty checkout event is received</p>
            </div>
            <Switch checked={autoCreateJob} onCheckedChange={setAutoCreateJob} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-sm font-medium">Default clean type</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Clean type assigned to auto-created jobs</p>
            </div>
            <Select value={defaultCleanType} onValueChange={setDefaultCleanType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard Clean</SelectItem>
                <SelectItem value="deep">Deep Clean</SelectItem>
                <SelectItem value="airbnb">Airbnb Turnover</SelectItem>
                <SelectItem value="commercial">Commercial Clean</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <Label className="text-sm font-medium">Buffer time after checkout (hours)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Time gap between guest checkout and clean start</p>
            </div>
            <Input
              type="number"
              min={0}
              max={12}
              value={bufferHours}
              onChange={(e) => setBufferHours(e.target.value)}
              className="h-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Property Mapping */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Property Mapping</CardTitle>
          <CardDescription>Map Guesty listings to Brightly properties via the Guesty Listing ID on each property profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 text-xs font-semibold text-muted-foreground border-b">
              <span>Brightly Property</span>
              <span>Guesty Listing ID</span>
            </div>
            {properties.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground text-center">No properties found</p>
            )}
            {properties.map((p: any) => (
              <div key={p.id} className="grid grid-cols-2 gap-4 p-3 border-b last:border-b-0 items-center">
                <span className="text-sm font-medium truncate">{p.property_name}</span>
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {p.guesty_listing_id || '—'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Set the Guesty Listing ID on each property's profile page to enable auto-mapping.
          </p>
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Webhook URL</CardTitle>
          <CardDescription>Add this URL in your Guesty dashboard under Webhooks</CardDescription>
        </CardHeader>
        <CardContent>
          <code className="text-xs bg-muted p-2 rounded-lg block break-all">
            {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receive-guesty-webhook`}
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            Event: reservation.checkout / reservation.updated (status = checked_out)
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSaveSettings} disabled={saving} className="gap-2 w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Settings
      </Button>

      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800 font-medium">
          ⚠️ Changes here affect all new auto-created jobs. Existing jobs are not modified.
        </p>
      </div>
    </div>
  );
}
