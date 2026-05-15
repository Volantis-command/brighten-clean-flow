import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Package, Settings2, CheckCircle2, Clock, ExternalLink, RefreshCw, Send } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';

function formatDt(ts: string | null): string {
  if (!ts) return '—';
  try { return format(parseISO(ts), 'EEE d MMM, h:mm a'); } catch { return ts; }
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try { return format(parseISO(d), 'EEE d MMM yyyy'); } catch { return d; }
}

export default function LinenAdminPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'deliveries' | 'settings'>('deliveries');

  // ── Deliveries ─────────────────────────────────────────────────────────────
  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['linen-deliveries-admin'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('linen_deliveries')
        .select(`
          id, status, deliver_by, delivered_at, linen_requirements, sms_sent_at, created_at,
          jobs:job_id ( id, scheduled_date, scheduled_time ),
          properties:property_id ( id, address, property_name )
        `)
        .or(`status.eq.pending,jobs.scheduled_date.gte.${todayStr}`)
        .order('deliver_by', { ascending: true });
      if (error) throw error;
      // Filter to upcoming + pending
      return (data || []).filter((d: any) => {
        const jobDate = d.jobs?.scheduled_date;
        return !jobDate || jobDate >= todayStr || d.status === 'pending';
      });
    },
    refetchInterval: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'delivered' }) => {
      const { error } = await supabase
        .from('linen_deliveries')
        .update({
          status,
          delivered_at: status === 'delivered' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['linen-deliveries-admin'] }),
    onError: (e: any) => toast.error(e.message || 'Failed to update'),
  });

  const resendSms = async (jobId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-linen-sms', { body: { job_id: jobId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('SMS resent to linen company.');
      qc.invalidateQueries({ queryKey: ['linen-deliveries-admin'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to resend SMS');
    }
  };

  const pending = deliveries.filter((d: any) => d.status === 'pending');
  const delivered = deliveries.filter((d: any) => d.status === 'delivered');

  // ── Settings ────────────────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    supabase.from('linen_settings').select('*').limit(1).single().then(({ data }) => {
      if (data) {
        setCompanyName((data as any).company_name || '');
        setPhone((data as any).phone || '');
        setNotes((data as any).notes || '');
      }
    });
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const { data: existing } = await supabase.from('linen_settings').select('id').limit(1).single();
      if (existing?.id) {
        await supabase.from('linen_settings').update({
          company_name: companyName,
          phone,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        } as any).eq('id', existing.id);
      } else {
        await supabase.from('linen_settings').insert({ company_name: companyName, phone, notes: notes || null } as any);
      }
      toast.success('Settings saved.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-extrabold text-primary">Linen</h1>
        </div>
        <a
          href="/linen-portal"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors border border-border rounded-xl px-3 py-2"
        >
          <ExternalLink className="h-4 w-4" />
          Open linen portal
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {(['deliveries', 'settings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {tab === 'deliveries' && pending.length > 0 && (
              <span className="ml-1.5 bg-yellow-500 text-black text-xs font-bold rounded-full px-1.5 py-0.5">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Deliveries tab ── */}
      {activeTab === 'deliveries' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : deliveries.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-semibold text-foreground">All clear</p>
              <p className="text-sm text-muted-foreground mt-1">No upcoming linen deliveries.</p>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-card rounded-2xl border border-border p-4 text-center">
                  <p className="text-2xl font-extrabold text-yellow-500">{pending.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pending</p>
                </div>
                <div className="bg-card rounded-2xl border border-border p-4 text-center">
                  <p className="text-2xl font-extrabold text-primary">{delivered.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Delivered</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Property</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Clean date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Deliver by</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {deliveries.map((d: any) => {
                      const isDelivered = d.status === 'delivered';
                      const deliverBy = d.deliver_by ? parseISO(d.deliver_by) : null;
                      const isOverdue = deliverBy && !isDelivered && isPast(deliverBy);
                      const jobId = d.jobs?.id;

                      return (
                        <tr key={d.id} className={`transition-colors hover:bg-muted/30 ${isDelivered ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground truncate max-w-[180px]">
                              {(d.properties as any)?.address || (d.properties as any)?.property_name || '—'}
                            </p>
                            {d.linen_requirements && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px] mt-0.5">
                                {d.linen_requirements.split('\n')[0]}
                                {d.linen_requirements.includes('\n') ? '…' : ''}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                            {formatDate(d.jobs?.scheduled_date)}
                            {d.jobs?.scheduled_time ? ` · ${d.jobs.scheduled_time.slice(0, 5)}` : ''}
                          </td>
                          <td className="px-4 py-3">
                            <span className={isOverdue ? 'text-red-500 font-semibold' : 'text-foreground'}>
                              {formatDt(d.deliver_by)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              className={`text-xs font-bold border-0 ${
                                isDelivered
                                  ? 'bg-primary/15 text-primary'
                                  : isOverdue
                                  ? 'bg-red-500/15 text-red-500'
                                  : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                              }`}
                            >
                              {isDelivered ? 'Delivered' : isOverdue ? 'Overdue' : 'Pending'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => toggleMutation.mutate({ id: d.id, status: isDelivered ? 'pending' : 'delivered' })}
                                disabled={toggleMutation.isPending}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                title={isDelivered ? 'Mark pending' : 'Mark delivered'}
                              >
                                {isDelivered ? <RefreshCw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
                              </button>
                              {jobId && (
                                <button
                                  onClick={() => resendSms(jobId)}
                                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                  title="Resend SMS to linen company"
                                >
                                  <Send className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Settings tab ── */}
      {activeTab === 'settings' && (
        <div className="space-y-5 max-w-lg">
          <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-foreground">Linen Company</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This phone number receives SMS alerts and is used to log into{' '}
                <span className="font-mono text-xs">app.brightly.cleaning/linen-portal</span>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Company name</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Gold Coast Linen Co" className="h-12 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Phone number</Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+61 400 000 000" className="h-12 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Notes (optional)</Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any notes about the linen company or delivery process…"
                rows={3}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <Button onClick={saveSettings} disabled={savingSettings} className="rounded-xl h-11">
              {savingSettings ? 'Saving…' : 'Save settings'}
            </Button>
          </div>

          <div className="bg-muted/40 rounded-2xl border border-border p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">How it works</h3>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
              <li>Set linen requirements per property in the <strong>SOP tab</strong> of any property profile.</li>
              <li>When a job is created for that property, an SMS is automatically sent to the linen company.</li>
              <li>SMS includes: property address, clean date/time, and deliver-by time (12h before clean).</li>
              <li>The linen company logs into the portal to mark deliveries as done.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
