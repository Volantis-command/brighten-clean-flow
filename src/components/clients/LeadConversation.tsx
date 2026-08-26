// The text conversation with a lead, and a box to reply from.
//
// Until now the only way to see what someone had written was the alert text
// sent to BJ's own phone, truncated to 140 characters, and the only way to
// answer was to pick up that phone. Nothing was readable in the office.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Send, MessageSquare } from 'lucide-react';

interface Ev {
  id: string; kind: string; body: string | null; actor: string | null; created_at: string;
  delivery_status?: string | null; error_code?: string | null;
}

// Twilio's words, in English. "queued" and "sent" both mean it has left us but
// has NOT been confirmed on their handset, so neither is allowed to read as
// success.
const deliveryLabel = (s: string) => ({
  queued: 'sending...',
  accepted: 'sending...',
  sending: 'sending...',
  sent: 'sent, not yet confirmed',
  delivered: 'delivered',
  undelivered: 'DID NOT ARRIVE',
  failed: 'FAILED TO SEND',
}[s] || s);

const failed = (e: { kind: string; delivery_status?: string | null }) =>
  e.kind === 'sms_out' && (e.delivery_status === 'failed' || e.delivery_status === 'undelivered');

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function LeadConversation({ leadId, leadName, phone }: { leadId: string; leadName: string; phone?: string | null }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // Read BOTH message stores and merge them.
  //
  // Dean texted three times, BJ got the alerts, and the thread showed nothing.
  // Cause: Jess's own logger writes to sms_conversations (keyed by phone) while
  // this panel only read lead_events (keyed by lead). Whenever the deployed
  // function is a version that writes to one and not the other, the
  // conversation silently disappears from the office view even though the
  // customer is having it. Reading both makes the thread correct regardless of
  // which version is live.
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['lead-thread', leadId, phone],
    queryFn: async () => {
      const [ev, sc] = await Promise.all([
        (supabase as any).from('lead_events')
          .select('id, kind, body, actor, created_at, delivery_status, error_code')
          .eq('lead_id', leadId).in('kind', ['sms_in', 'sms_out'])
          .order('created_at', { ascending: true }),
        phone
          ? (supabase as any).from('sms_conversations')
              .select('id, direction, body, sender_type, created_at')
              .eq('phone', phone).order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      if (ev.error) throw ev.error;
      if (sc?.error) console.error('sms_conversations unavailable:', sc.error);

      const fromEvents: Ev[] = (ev.data || []);
      const fromConvo: Ev[] = (sc?.data || []).map((r: any) => ({
        id: `sc-${r.id}`,
        kind: r.direction === 'in' ? 'sms_in' : 'sms_out',
        body: r.body,
        actor: r.sender_type === 'admin' ? 'admin' : r.sender_type === 'jess' ? 'jess' : null,
        created_at: r.created_at,
      }));

      // The same message can land in both stores. Treat identical text within
      // two minutes as one message rather than showing it twice.
      const merged: Ev[] = [...fromEvents];
      for (const c of fromConvo) {
        const dup = merged.some(m =>
          (m.body || '').trim() === (c.body || '').trim() &&
          Math.abs(new Date(m.created_at).getTime() - new Date(c.created_at).getTime()) < 120_000);
        if (!dup) merged.push(c);
      }
      return merged.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    },
    enabled: !!leadId,
    refetchInterval: 30_000,
  });

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-lead-sms', { body: { lead_id: leadId, body } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDraft('');
      qc.invalidateQueries({ queryKey: ['lead-thread', leadId, phone] });
      qc.invalidateQueries({ queryKey: ['lead-pipeline'] });
      toast.success(`Sent to ${leadName || 'them'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not send that text');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Texts</span>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto p-3">
        {isLoading && <Loader2 className="mx-auto my-4 h-4 w-4 animate-spin text-muted-foreground" />}
        {!isLoading && events.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No texts yet</p>
        )}
        {events.map(e => {
          const inbound = e.kind === 'sms_in';
          return (
            <div key={e.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                inbound ? 'bg-muted text-foreground'
                : failed(e) ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground'}`}>
                <p className="whitespace-pre-wrap text-sm leading-snug">{e.body}</p>
                <p className={`mt-1 text-[10px] ${inbound ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                  {inbound ? leadName || 'Them' : e.actor === 'admin' ? 'You' : 'Jess'} · {when(e.created_at)}
                  {!inbound && e.delivery_status && ` · ${deliveryLabel(e.delivery_status)}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
          rows={2}
          placeholder={`Text ${leadName || 'them'}...`}
          className="flex-1 resize-none rounded-xl border border-input bg-background p-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
          aria-label="Send text"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
