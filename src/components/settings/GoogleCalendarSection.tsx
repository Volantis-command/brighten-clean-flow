import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, Unplug, Save, CheckCircle2, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const GCAL_LOGO = (
  <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
    <rect width="32" height="32" rx="8" fill="#4285F4" />
    <rect x="8" y="8" width="16" height="16" rx="2" fill="white" />
    <rect x="10" y="14" width="12" height="1.5" rx="0.5" fill="#4285F4" />
    <rect x="10" y="17" width="12" height="1.5" rx="0.5" fill="#EA4335" />
    <rect x="10" y="20" width="8" height="1.5" rx="0.5" fill="#FBBC05" />
    <rect x="10" y="8" width="12" height="4" rx="1" fill="#34A853" />
  </svg>
);

export default function GoogleCalendarSection() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [autoCreateEvent, setAutoCreateEvent] = useState(true);
  const [addCleaner, setAddCleaner] = useState(true);
  const [inviteClient, setInviteClient] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['gcal-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_calendar_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isConnected = !!config?.access_token;

  useEffect(() => {
    if (!config) return;
    setAutoCreateEvent(config.auto_create_event ?? true);
    setAddCleaner(config.add_cleaner ?? true);
    setInviteClient(config.invite_client ?? false);
  }, [config]);

  // Listen for OAuth completion
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === 'gcal_connected') {
        queryClient.invalidateQueries({ queryKey: ['gcal-config'] });
        toast.success('Google Calendar connected!');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [queryClient]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth?action=get_auth_url`,
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
      if (config?.id) {
        await supabase.from('google_calendar_config').update({
          access_token: null,
          refresh_token: null,
          token_expiry: null,
          email: null,
          calendar_id: null,
          updated_at: new Date().toISOString(),
        }).eq('id', config.id);
      }
      queryClient.invalidateQueries({ queryKey: ['gcal-config'] });
      toast.success('Google Calendar disconnected');
    } catch (err: any) {
      toast.error(err.message);
    }
    setDisconnecting(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      if (config?.id) {
        await supabase.from('google_calendar_config').update({
          auto_create_event: autoCreateEvent,
          add_cleaner: addCleaner,
          invite_client: inviteClient,
          updated_at: new Date().toISOString(),
        }).eq('id', config.id);
      }
      queryClient.invalidateQueries({ queryKey: ['gcal-config'] });
      toast.success('Calendar settings saved');
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
            <div className="flex justify-center mb-3">{GCAL_LOGO}</div>
            <CardTitle className="text-xl">Connect Google Calendar</CardTitle>
            <CardDescription className="text-sm mt-1">
              Automatically add cleaning jobs to Google Calendar when they're confirmed. Keep your team's schedule synced.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full gap-2 font-bold text-white"
              style={{ backgroundColor: '#4285F4' }}
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
              Connect with Google
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              You'll be redirected to Google to authorize calendar access. Only calendar event permissions are requested.
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
            {GCAL_LOGO}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Google Calendar</CardTitle>
                <Badge className="bg-brightly/10 text-brightly border-green-300 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              </div>
              {config?.email && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Account: <span className="font-medium text-foreground">{config.email}</span>
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

      {/* Sync Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Sync Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Add job to calendar on confirm</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Creates a calendar event when a job is confirmed</p>
            </div>
            <Switch checked={autoCreateEvent} onCheckedChange={setAutoCreateEvent} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Add cleaner as attendee</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Sends a calendar invite to the assigned cleaner</p>
            </div>
            <Switch checked={addCleaner} onCheckedChange={setAddCleaner} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Invite client</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Sends a calendar invite to the property client</p>
            </div>
            <Switch checked={inviteClient} onCheckedChange={setInviteClient} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSaveSettings} disabled={saving} className="gap-2 w-full sm:w-auto">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Settings
      </Button>

      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800 font-medium">
          ⚠️ Changes affect future jobs only. Existing calendar events are not modified.
        </p>
      </div>
    </div>
  );
}
