// Rate a shadow clean: out of 10, then Pass, Needs more work or Fail, plus
// notes. The notes land in the trainee's training record as coach notes.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { OUTCOME_LABEL, rateShadowClean, shortDate, type ShadowClean, type ShadowOutcome } from '@/lib/shadowCleans';

const OUTCOMES: { value: ShadowOutcome; tone: string }[] = [
  { value: 'pass', tone: 'border-primary bg-primary text-primary-foreground' },
  { value: 'needs_more_work', tone: 'border-amber-400 bg-amber-400 text-black' },
  { value: 'fail', tone: 'border-destructive bg-destructive text-destructive-foreground' },
];

export default function ShadowCleanRatingDialog({
  session, open, onOpenChange, onRated,
}: {
  session: ShadowClean | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRated: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<ShadowOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(session?.rating ?? null);
    setOutcome(session?.outcome ?? null);
    setNotes(session?.notes ?? '');
  }, [open, session]);

  const submit = async () => {
    if (!session || rating === null || !outcome) return;
    setSaving(true);
    try {
      await rateShadowClean(session.id, rating, outcome, notes);
      toast.success(`Shadow clean rated ${rating}/10, ${OUTCOME_LABEL[outcome]}`);
      onRated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Rate {session?.trainee_name || 'this'} shadow clean</DialogTitle>
          <DialogDescription>
            {session ? `${session.property_name || 'Clean'} · ${shortDate(session.scheduled_date, session.scheduled_time)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Score out of 10</p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`h-10 rounded-lg border text-sm font-bold transition-colors ${
                    rating === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Outcome</p>
            <div className="grid grid-cols-3 gap-2">
              {OUTCOMES.map(o => (
                <button
                  key={o.value}
                  onClick={() => setOutcome(o.value)}
                  className={`min-h-11 rounded-xl border px-2 text-sm font-bold transition-colors ${
                    outcome === o.value ? o.tone : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {OUTCOME_LABEL[o.value]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A Fail doesn't count towards training. To be approved, their second shadow clean needs a Pass and 8/10 or more.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Notes for their training record</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What went well, and what to work on next time"
              className="min-h-24 rounded-xl"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={submit}
            disabled={saving || rating === null || !outcome}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save rating
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
