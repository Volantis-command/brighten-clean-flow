// Per-client Hostaway connection UI on the Client Detail Overview tab.
//
// - If the client has no hostaway_tokens row: render the connect form
//   (client_id + secret).
// - If they do: show "Connected" status with hostaway_account_id and
//   a button to reconnect / disconnect.
//
// Wires to the `hostaway-connect` edge function which exchanges the
// credentials for an access token and stores it.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plug, CheckCircle2, AlertCircle, RefreshCw, CalendarRange } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SyncListingResult {
  hostaway_listing_id: string;
  name: string;
  address: string | null;
  status: 'matched' | 'created' | 'error';
  property_id: string | null;
  error?: string;
}

interface SyncSummary {
  total: number;
  matched: number;
  created: number;
  errors: number;
}

interface ReservationResult {
  reservation_id: string;
  listing_id: string | null;
  departure_date: string | null;
  guest_name: string;
  status: string;
  job_id: string | null;
  error?: string;
}

interface ReservationSummary {
  fetched_from_hostaway: number;
  in_range: number;
  created: number;
  updated: number;
  cancelled: number;
  no_op: number;
  no_property: number;
  errors: number;
  range: { from_date: string; to_date: string };
}

interface Props {
  clientId: string;
}

export default function HostawayIntegrationSection({ clientId }: Props) {
  const queryClient = useQueryClient();

  const { data: token, isLoading } = useQuery({
    queryKey: ['hostaway-token', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hostaway_tokens' as any)
        .select('id, hostaway_account_id, expires_at, last_synced_at, created_at')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  const [hostawayClientId, setHostawayClientId] = useState('');
  const [hostawayClientSecret, setHostawayClientSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ summary: SyncSummary; results: SyncListingResult[] } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ summary: ReservationSummary; results: ReservationResult[] } | null>(null);

  const handleConnect = async () => {
    if (!hostawayClientId.trim() || !hostawayClientSecret.trim()) {
      toast.error('Both Hostaway Client ID and Client Secret are required');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('hostaway-connect', {
        body: {
          client_id: clientId,
          hostaway_client_id: hostawayClientId.trim(),
          hostaway_client_secret: hostawayClientSecret.trim(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Hostaway connected — account ${(data as any)?.hostaway_account_id ?? '?'}`);
      setHostawayClientId('');
      setHostawayClientSecret('');
      setShowReconnect(false);
      queryClient.invalidateQueries({ queryKey: ['hostaway-token', clientId] });
    } catch (e: any) {
      toast.error(e.message || 'Could not connect Hostaway');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncListings = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('hostaway-sync-listings', {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const summary = (data as any)?.summary as SyncSummary | undefined;
      const results = (data as any)?.results as SyncListingResult[] | undefined;
      if (!summary || !results) throw new Error('Sync response missing summary or results');

      setSyncResult({ summary, results });

      const parts: string[] = [];
      if (summary.created) parts.push(`${summary.created} created`);
      if (summary.matched) parts.push(`${summary.matched} already linked`);
      if (summary.errors) parts.push(`${summary.errors} failed`);
      const msg = parts.length ? parts.join(', ') : 'no listings on Hostaway';
      if (summary.errors > 0) toast.warning(`Sync finished — ${msg}`);
      else toast.success(`Sync finished — ${msg}`);

      queryClient.invalidateQueries({ queryKey: ['hostaway-token', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-properties', clientId] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch (e: any) {
      toast.error(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleBackfillReservations = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('hostaway-sync-reservations', {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const summary = (data as any)?.summary as ReservationSummary | undefined;
      const results = (data as any)?.results as ReservationResult[] | undefined;
      if (!summary || !results) throw new Error('Backfill response missing summary or results');

      setBackfillResult({ summary, results });

      const parts: string[] = [];
      if (summary.created) parts.push(`${summary.created} created`);
      if (summary.updated) parts.push(`${summary.updated} updated`);
      if (summary.cancelled) parts.push(`${summary.cancelled} cancelled`);
      if (summary.no_property) parts.push(`${summary.no_property} unmapped`);
      if (summary.errors) parts.push(`${summary.errors} failed`);
      const msg = parts.length ? parts.join(', ') : 'no changes';
      if (summary.errors > 0 || summary.no_property > 0) toast.warning(`Backfill done — ${msg}`);
      else toast.success(`Backfill done — ${msg}`);

      queryClient.invalidateQueries({ queryKey: ['hostaway-token', clientId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e: any) {
      toast.error(e.message || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const handleDisconnect = async () => {
    if (!token) return;
    if (!confirm('Disconnect Hostaway for this client? They\u2019ll need to re-enter credentials to reconnect.')) return;
    const { error } = await supabase
      .from('hostaway_tokens' as any)
      .delete()
      .eq('client_id', clientId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Hostaway disconnected');
    queryClient.invalidateQueries({ queryKey: ['hostaway-token', clientId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" />
          Hostaway Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : token && !showReconnect ? (
          <ConnectedView
            token={token as any}
            onReconnect={() => setShowReconnect(true)}
            onDisconnect={handleDisconnect}
            onSync={handleSyncListings}
            syncing={syncing}
            syncResult={syncResult}
            onBackfill={handleBackfillReservations}
            backfilling={backfilling}
            backfillResult={backfillResult}
          />
        ) : (
          <ConnectForm
            hostawayClientId={hostawayClientId}
            hostawayClientSecret={hostawayClientSecret}
            onChangeId={setHostawayClientId}
            onChangeSecret={setHostawayClientSecret}
            onSubmit={handleConnect}
            submitting={submitting}
            isReconnect={!!token && showReconnect}
            onCancel={() => setShowReconnect(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ConnectedView({
  token,
  onReconnect,
  onDisconnect,
  onSync,
  syncing,
  syncResult,
  onBackfill,
  backfilling,
  backfillResult,
}: {
  token: { hostaway_account_id: string; expires_at: string | null; last_synced_at: string | null; created_at: string };
  onReconnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  syncing: boolean;
  syncResult: { summary: SyncSummary; results: SyncListingResult[] } | null;
  onBackfill: () => void;
  backfilling: boolean;
  backfillResult: { summary: ReservationSummary; results: ReservationResult[] } | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <CheckCircle2 className="h-4 w-4" />
        Connected to Hostaway
      </div>

      <div className="grid gap-2 text-sm">
        <Row label="Account ID" value={token.hostaway_account_id} mono />
        <Row label="Connected" value={format(new Date(token.created_at), 'd MMM yyyy')} />
        {token.last_synced_at && (
          <Row label="Last sync" value={format(new Date(token.last_synced_at), 'd MMM yyyy h:mm a')} />
        )}
        {token.expires_at && (
          <Row label="Token expires" value={format(new Date(token.expires_at), 'd MMM yyyy')} />
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={onSync} disabled={syncing || backfilling}>
          {syncing ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Syncing listings…</>
          ) : (
            <><RefreshCw className="h-4 w-4 mr-1" /> Sync listings from Hostaway</>
          )}
        </Button>
        <Button size="sm" variant="secondary" onClick={onBackfill} disabled={syncing || backfilling}>
          {backfilling ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Backfilling reservations…</>
          ) : (
            <><CalendarRange className="h-4 w-4 mr-1" /> Backfill reservations</>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={onReconnect}>Reconnect</Button>
        <Button variant="outline" size="sm" onClick={onDisconnect} className="text-destructive">Disconnect</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Sync listings</span> imports properties from Hostaway. <span className="font-semibold">Backfill reservations</span> creates turnover jobs for the last 30 / next 60 days — useful for first-time setup or after webhook downtime.
      </p>

      {syncResult && <SyncResultPanel result={syncResult} />}
      {backfillResult && <BackfillResultPanel result={backfillResult} />}
    </div>
  );
}

function SyncResultPanel({ result }: { result: { summary: SyncSummary; results: SyncListingResult[] } }) {
  const { summary, results } = result;
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Last sync result
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span><span className="font-semibold">{summary.total}</span> on Hostaway</span>
        {summary.created > 0 && (
          <span className="text-green-700"><span className="font-semibold">{summary.created}</span> created</span>
        )}
        {summary.matched > 0 && (
          <span className="text-muted-foreground"><span className="font-semibold">{summary.matched}</span> already linked</span>
        )}
        {summary.errors > 0 && (
          <span className="text-destructive"><span className="font-semibold">{summary.errors}</span> failed</span>
        )}
      </div>

      {results.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
            Show details
          </summary>
          <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {results.map((r) => (
              <li key={r.hostaway_listing_id || r.name} className="flex items-start justify-between gap-2 py-1 border-b last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  {r.address && <div className="text-xs text-muted-foreground truncate">{r.address}</div>}
                  {r.error && <div className="text-xs text-destructive">{r.error}</div>}
                </div>
                <span className={`text-xs whitespace-nowrap ${
                  r.status === 'created' ? 'text-green-700' :
                  r.status === 'matched' ? 'text-muted-foreground' :
                  'text-destructive'
                }`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function BackfillResultPanel({ result }: { result: { summary: ReservationSummary; results: ReservationResult[] } }) {
  const { summary, results } = result;
  const meaningful = results.filter((r) => r.status !== 'skipped_out_of_range' && r.status !== 'skipped_no_departure');

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Last backfill ({summary.range.from_date} → {summary.range.to_date})
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span><span className="font-semibold">{summary.fetched_from_hostaway}</span> on Hostaway · <span className="font-semibold">{summary.in_range}</span> in range</span>
        {summary.created > 0 && (
          <span className="text-green-700"><span className="font-semibold">{summary.created}</span> created</span>
        )}
        {summary.updated > 0 && (
          <span className="text-blue-700"><span className="font-semibold">{summary.updated}</span> updated</span>
        )}
        {summary.cancelled > 0 && (
          <span className="text-amber-700"><span className="font-semibold">{summary.cancelled}</span> cancelled</span>
        )}
        {summary.no_op > 0 && (
          <span className="text-muted-foreground"><span className="font-semibold">{summary.no_op}</span> unchanged</span>
        )}
        {summary.no_property > 0 && (
          <span className="text-amber-700"><span className="font-semibold">{summary.no_property}</span> unmapped (run Sync listings)</span>
        )}
        {summary.errors > 0 && (
          <span className="text-destructive"><span className="font-semibold">{summary.errors}</span> failed</span>
        )}
      </div>

      {meaningful.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
            Show details ({meaningful.length})
          </summary>
          <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
            {meaningful.map((r) => (
              <li key={r.reservation_id} className="flex items-start justify-between gap-2 py-1 border-b last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.guest_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.departure_date ?? 'no departure'}
                    {r.listing_id ? ` · listing ${r.listing_id}` : ''}
                  </div>
                  {r.error && <div className="text-xs text-destructive">{r.error}</div>}
                </div>
                <span className={`text-xs whitespace-nowrap ${
                  r.status === 'created' ? 'text-green-700' :
                  r.status === 'updated' ? 'text-blue-700' :
                  r.status === 'cancelled' ? 'text-amber-700' :
                  r.status === 'no_property' ? 'text-amber-700' :
                  r.status === 'error' ? 'text-destructive' :
                  'text-muted-foreground'
                }`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ConnectForm({
  hostawayClientId,
  hostawayClientSecret,
  onChangeId,
  onChangeSecret,
  onSubmit,
  submitting,
  isReconnect,
  onCancel,
}: {
  hostawayClientId: string;
  hostawayClientSecret: string;
  onChangeId: (v: string) => void;
  onChangeSecret: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  isReconnect: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enter the client&rsquo;s Hostaway API credentials. They&rsquo;re available in their Hostaway dashboard under{' '}
        <span className="font-semibold">Settings → API Keys</span>.
      </p>

      <div className="space-y-2">
        <Label htmlFor="hostaway-client-id" className="font-semibold">Hostaway Client ID</Label>
        <Input
          id="hostaway-client-id"
          value={hostawayClientId}
          onChange={(e) => onChangeId(e.target.value)}
          placeholder="e.g. 12345"
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="hostaway-client-secret" className="font-semibold">Hostaway Client Secret</Label>
        <Input
          id="hostaway-client-secret"
          type="password"
          value={hostawayClientSecret}
          onChange={(e) => onChangeSecret(e.target.value)}
          placeholder="••••••••••••"
          disabled={submitting}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Connecting…</>
          ) : (
            <>{isReconnect ? 'Reconnect' : 'Connect Hostaway'}</>
          )}
        </Button>
        {isReconnect && (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Credentials are exchanged for an access token immediately. We never store the secret in plaintext after the exchange.
      </p>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
