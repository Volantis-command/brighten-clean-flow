import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Check, Loader2, MessageSquareWarning, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CATEGORY_META, fetchJobFeedback, outstandingItems, recordFeedbackCheck, type JobFeedbackItem,
} from '@/lib/clientFeedback';

export const CLIENT_NOTES_PANEL_ID = 'client-notes-panel';

export function jobFeedbackKey(jobId: string | undefined) {
  return ['job-client-feedback', jobId] as const;
}

/** Shared by the panel and the Complete gate so they read one cached answer. */
export function useJobClientFeedback(jobId: string | undefined) {
  return useQuery({
    queryKey: jobFeedbackKey(jobId),
    queryFn: () => fetchJobFeedback(jobId!),
    enabled: !!jobId,
    staleTime: 30_000,
  });
}

const fmt = (d: string | null) => (d ? format(parseISO(d), 'd MMM') : '');

interface Props {
  jobId: string;
  /** false before clock on: read it, can't tick it yet. */
  interactive: boolean;
}

/**
 * The client's notes for this clean, at the top of the cleaner's screen.
 * Every note has to be answered Done or Couldn't do before the job can finish.
 */
export default function ClientNotesPanel({ jobId, interactive }: Props) {
  const { data: items = [], isLoading } = useJobClientFeedback(jobId);
  if (isLoading || items.length === 0) return null;
  const left = outstandingItems(items).length;

  return (
    <Card id={CLIENT_NOTES_PANEL_ID} className="border-2 border-amber-400 bg-amber-50 dark:bg-amber-500/10 scroll-mt-20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <MessageSquareWarning className="h-4 w-4" />
            From the client ({items.length})
          </p>
          {interactive && (
            <span className={cn(
              'text-[11px] font-bold px-2 py-0.5 rounded-full',
              left ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground',
            )}>
              {left ? `${left} to tick` : 'All answered'}
            </span>
          )}
        </div>
        {!interactive && (
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
            Read these before you start. You tick each one off during the clean.
          </p>
        )}
        <ul className="space-y-2.5">
          {items.map((item) => (
            <NoteRow key={item.id} item={item} jobId={jobId} interactive={interactive} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NoteRow({ item, jobId, interactive }: { item: JobFeedbackItem; jobId: string; interactive: boolean }) {
  const queryClient = useQueryClient();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState(item.this_job_note || '');
  const [saving, setSaving] = useState(false);
  const meta = CATEGORY_META[item.category];

  const save = async (outcome: 'done' | 'not_done') => {
    if (outcome === 'not_done' && reason.trim().length < 3) {
      toast.error('Say why it could not be done');
      return;
    }
    setSaving(true);
    try {
      await recordFeedbackCheck(item.id, jobId, outcome, outcome === 'not_done' ? reason.trim() : undefined);
      setReasonOpen(false);
      await queryClient.invalidateQueries({ queryKey: jobFeedbackKey(jobId) });
    } catch (e: any) {
      toast.error(e?.message || 'Could not save. Check your signal and try again.');
    } finally {
      setSaving(false);
    }
  };

  const outcome = item.this_job_outcome;

  return (
    <li className={cn(
      'rounded-xl border bg-card p-3 space-y-2',
      outcome === 'done' ? 'border-primary/40' : outcome === 'not_done' ? 'border-destructive/40' : 'border-amber-300',
    )}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={cn(
          'text-[10.5px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full',
          item.category === 'missed' ? 'bg-destructive/15 text-destructive'
            : item.category === 'every_clean' ? 'bg-primary/15 text-primary'
            : 'bg-amber-500/20 text-amber-800 dark:text-amber-200',
        )}>
          {meta.cleaner}
        </span>
        {item.room && <span className="text-[11px] font-bold text-muted-foreground">{item.room}</span>}
        {item.source_job_date && item.category !== 'every_clean' && (
          <span className="text-[11px] text-muted-foreground">from the {fmt(item.source_job_date)} clean</span>
        )}
      </div>

      <p className="text-sm font-semibold text-foreground whitespace-pre-wrap break-words">{item.message}</p>

      {item.times_not_done > 0 && item.last_not_done_note && (
        <p className="text-xs text-destructive">
          Not done {item.times_not_done > 1 ? `${item.times_not_done} times. Last time` : 'last time'}
          {item.last_not_done_date ? ` (${fmt(item.last_not_done_date)}` : ''}
          {item.last_not_done_by ? `, ${item.last_not_done_by}` : ''}
          {item.last_not_done_date ? ')' : ''}: {item.last_not_done_note}
        </p>
      )}

      {outcome && !reasonOpen && (
        <p className={cn('text-xs font-bold', outcome === 'done' ? 'text-primary' : 'text-destructive')}>
          {outcome === 'done' ? 'Done' : `Couldn't do: ${item.this_job_note}`}
          {item.this_job_checked_by ? ` (${item.this_job_checked_by})` : ''}
        </p>
      )}

      {interactive && reasonOpen && (
        <div className="space-y-2">
          <Textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="Why not? The office and the next cleaner will see this."
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" className="flex-1" disabled={saving} onClick={() => save('not_done')}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReasonOpen(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}

      {interactive && !reasonOpen && (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            variant={outcome === 'done' ? 'default' : 'outline'}
            disabled={saving}
            onClick={() => save('done')}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Done</>}
          </Button>
          <Button
            size="sm"
            className="flex-1"
            variant={outcome === 'not_done' ? 'destructive' : 'outline'}
            disabled={saving}
            onClick={() => setReasonOpen(true)}
          >
            <X className="h-4 w-4 mr-1" /> Couldn't do
          </Button>
        </div>
      )}
    </li>
  );
}
