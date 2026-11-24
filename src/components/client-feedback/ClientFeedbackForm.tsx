import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Loader2, MessageSquarePlus, RotateCw, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CATEGORY_META, ROOMS, clientStatusText, fetchClientFeedback, submitClientFeedback, suggestRoom,
  type FeedbackCategory,
} from '@/lib/clientFeedback';

interface Props {
  /** jobs.report_token of the clean the client is writing about. */
  reportToken: string;
  /** Has this clean been done? A clean not done yet can't have missed anything. */
  jobDone: boolean;
  onSent?: () => void;
}

const fmt = (d: string) => format(parseISO(d), 'd MMM');

export default function ClientFeedbackForm({ reportToken, jobDone, onSent }: Props) {
  const queryClient = useQueryClient();
  const categories: FeedbackCategory[] = jobDone
    ? ['missed', 'next_clean', 'every_clean']
    : ['next_clean', 'every_clean'];

  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState('');
  const [room, setRoom] = useState<string | null>(null);
  const [roomTouched, setRoomTouched] = useState(false);
  const [sending, setSending] = useState(false);

  // Guess the room from what they type, until they pick one themselves.
  useEffect(() => {
    if (!roomTouched) setRoom(suggestRoom(message));
  }, [message, roomTouched]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['client-feedback', reportToken],
    queryFn: () => fetchClientFeedback(reportToken),
    enabled: !!reportToken,
  });

  const send = async () => {
    if (!category || message.trim().length < 2 || sending) return;
    setSending(true);
    try {
      await submitClientFeedback(reportToken, category, message.trim(), room);
      toast.success(category === 'every_clean'
        ? 'Saved. Your cleaners will see this on every clean.'
        : 'Sent. Your cleaner will see this on the next clean.');
      setCategory(null); setMessage(''); setRoom(null); setRoomTouched(false);
      queryClient.invalidateQueries({ queryKey: ['client-feedback', reportToken] });
      onSent?.();
    } catch (e: any) {
      toast.error(e?.message || 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* What kind of note */}
      <div className="grid gap-2">
        {categories.map((c) => {
          const meta = CATEGORY_META[c];
          const active = category === c;
          const Icon = c === 'missed' ? RotateCw : c === 'every_clean' ? Repeat : MessageSquarePlus;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'w-full text-left rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors',
                active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  {jobDone ? meta.client : meta.clientUpcoming}
                </span>
                <span className="block text-xs text-muted-foreground">{meta.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {category && (
        <div className="space-y-3">
          <Textarea
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
            placeholder={CATEGORY_META[category].placeholder}
            rows={3}
            className="text-base"
          />
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-1.5">Where? (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              {ROOMS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRoomTouched(true); setRoom(room === r ? null : r); }}
                  className={cn(
                    'text-xs font-bold px-2.5 py-1 rounded-full border transition-colors',
                    room === r ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" disabled={message.trim().length < 2 || sending} onClick={send}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send to your cleaner'}
          </Button>
        </div>
      )}

      {/* What happened to earlier notes */}
      {!isLoading && notes.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Your notes for this property
          </p>
          <ul className="space-y-2">
            {notes.slice(0, 12).map((n) => {
              const done = n.status === 'done';
              return (
                <li key={n.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{n.message}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full',
                      done ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                    )}>
                      {done && <CheckCircle2 className="h-3 w-3" />}
                      {clientStatusText(n, fmt)}
                    </span>
                    {n.room && <span className="text-[11px] text-muted-foreground">{n.room}</span>}
                    <span className="text-[11px] text-muted-foreground">Sent {fmt(n.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
