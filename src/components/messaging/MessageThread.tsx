// One text thread with one person, wherever they show up in the app.
//
// This replaces two half-working things. The lead panel read only lead_events,
// so it missed anything Jess or the rest of the system said. The Messages tab
// on a client was worse: its reply box inserted a row into client_messages,
// toasted "Reply sent", and never sent a text at all.
//
// The thread is keyed by PHONE, not by lead or client, because a person is
// usually both and their conversation should not split in half the moment they
// book. Reads sms_conversations (the log every sender now writes to, and that
// sync-twilio-messages fills in from Twilio every five minutes), and folds in
// the two older stores so no history is lost.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Send, MessageSquare } from 'lucide-react';

interface Msg {
  id: string;
  inbound: boolean;
  body: string | null;
  who: string | null;          // 'admin' | 'jess' | null
  created_at: string;
  delivery_status?: string | null;
}

// Twilio's words, in English. "queued" and "sent" both mean it left us but has
// NOT been confirmed on their handset, so neither is allowed to read as success.
const deliveryLabel = (s: string) => ({
  queued: 'sending...',
  accepted: 'sending...',
  sending: 'sending...',
  sent: 'sent, not yet confirmed',
  delivered: 'delivered',
  undelivered: 'DID NOT ARRIVE',
  failed: 'FAILED TO SEND',
}[s] || s);

const failed = (m: Msg) =>
  !m.inbound && (m.delivery_status === 'failed' || m.delivery_status === 'undelivered');

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// The same mobile written every way this app has ever stored it. Without this
// a thread logged as +61412345678 is invisible to a client whose profile says
// 0412 345 678.
function phoneVariants(raw: string): string[] {
  const c = (raw || '').replace(/[^\d+]/g, '');
  const out = new Set<string>([raw, c]);
  let national = '';
  if (/^0\d{9}$/.test(c)) national = c.slice(1);
  else if (/^\+61\d{9}$/.test(c)) national = c.slice(3);
  else if (/^61\d{9}$/.test(c)) national = c.slice(2);
  else if (/^4\d{8}$/.test(c)) national = c;
  if (national) {
    out.add('+61' + national);
    out.add('61' + national);
    out.add('0' + national);
    out.add(national);
  }
  return [...out].filter(Boolean);
}

export default function MessageThread({
  phone, name, leadId, profileId, title = 'Texts',
}: {
  phone?: string | null;
  name?: string | null;
  leadId?: string | null;
  profileId?: string | null;
  title?: string;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const key = ['message-thread', phone || '', leadId || '', profileId || ''];

  const { data: messages = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const variants = phone ? phoneVariants(phone) : [];

      const [convo, ev, legacy] = await Promise.all([
        variants.length
          ? (supabase as any).from('sms_conversations')
              .select('id, direction, body, sender_type, created_at, delivery_status')
              .in('phone', variants).order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
        leadId
          ? (supabase as any).from('lead_events')
              .select('id, kind, body, actor, created_at, delivery_status')
              .eq('lead_id', leadId).in('kind', ['sms_in', 'sms_out'])
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
        profileId
          ? (supabase as any).from('client_messages')
              .select('id, message, direction, sent_at')
              .eq('client_id', profileId).order('sent_at', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      // Do not swallow these. A thread that is empty because the query failed
      // looks exactly like a customer who never wrote, and that is how three of
      // Dean's texts went unanswered.
      if (convo?.error) console.error('sms_conversations unavailable:', convo.error);
      if (ev?.error) console.error('lead_events unavailable:', ev.error);
      if (legacy?.error) console.error('client_messages unavailable:', legacy.error);

      const all: Msg[] = [
        ...(convo?.data || []).map((r: any): Msg => ({
          id: `sc-${r.id}`,
          inbound: r.direction === 'in',
          body: r.body,
          who: r.sender_type === 'jess' ? 'jess' : r.sender_type === 'admin' ? 'admin' : null,
          created_at: r.created_at,
          delivery_status: r.delivery_status,
        })),
        ...(ev?.data || []).map((r: any): Msg => ({
          id: `ev-${r.id}`,
          inbound: r.kind === 'sms_in',
          body: r.body,
          who: r.actor === 'admin' ? 'admin' : r.actor?.startsWith('jess') ? 'jess' : null,
          created_at: r.created_at,
          delivery_status: r.delivery_status,
        })),
        ...(legacy?.data || []).map((r: any): Msg => ({
          id: `cm-${r.id}`,
          inbound: r.direction === 'inbound',
          body: r.message,
          who: 'admin',
          created_at: r.sent_at,
        })),
      ];

      // One message can sit in more than one store: a text to a lead is written
      // to both sms_conversations and lead_events, and the Twilio sync may find
      // it a third time. Identical text within two minutes is one message.
      const merged: Msg[] = [];
      for (const m of all.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))) {
        const dup = merged.find(x =>
          (x.body || '').trim() === (m.body || '').trim() &&
          Math.abs(new Date(x.created_at).getTime() - new Date(m.created_at).getTime()) < 120_000);
        if (dup) {
          // Keep whichever copy knows more. Delivery status usually arrives on
          // the row the sender wrote, identity on the other.
          if (!dup.delivery_status && m.delivery_status) dup.delivery_status = m.delivery_status;
          if (!dup.who && m.who) dup.who = m.who;
          continue;
        }
        merged.push(m);
      }
      return merged;
    },
    enabled: !!(phone || leadId || profileId),
    refetchInterval: 30_000,
  });

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    if (!phone && !leadId && !profileId) { toast.error('No mobile number on file for them'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { lead_id: leadId || undefined, profile_id: profileId || undefined, to: phone || undefined, body },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDraft('');
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['lead-pipeline'] });
      toast.success(`Sent to ${name || 'them'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not send that text');
    } finally {
      setSending(false);
    }
  };

  const canSend = !!(phone || leadId || profileId);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{title}</span>
        {phone && <span className="ml-auto text-xs text-muted-foreground">{phone}</span>}
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto p-3">
        {isLoading && <Loader2 className="mx-auto my-4 h-4 w-4 animate-spin text-muted-foreground" />}
        {!isLoading && messages.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No texts yet</p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.inbound ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
              m.inbound ? 'bg-muted text-foreground'
              : failed(m) ? 'bg-destructive text-destructive-foreground'
              : 'bg-primary text-primary-foreground'}`}>
              <p className="whitespace-pre-wrap text-sm leading-snug">{m.body}</p>
              <p className={`mt-1 text-[10px] ${m.inbound ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                {m.inbound ? name || 'Them' : m.who === 'jess' ? 'Jess' : 'You'} · {when(m.created_at)}
                {!m.inbound && m.delivery_status && ` · ${deliveryLabel(m.delivery_status)}`}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
          rows={2}
          placeholder={canSend ? `Text ${name || 'them'}...` : 'No mobile number on file'}
          disabled={!canSend}
          className="flex-1 resize-none rounded-xl border border-input bg-background p-2 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim() || !canSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
          aria-label="Send text"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
