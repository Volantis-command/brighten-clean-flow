// ============================================================================
// Shadow cleans on a job (Schedule → job panel).
//
// Pick a trainee to shadow this job, listed by what they need next, and rate
// them once the clean is done. The job's Cleaner 1 is the supervisor.
// ============================================================================

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { GraduationCap, Loader2, Star, X } from 'lucide-react';
import ShadowCleanRatingDialog from '@/components/staff/ShadowCleanRatingDialog';
import { SessionStatus } from '@/components/staff/ShadowCleansPanel';
import {
  addShadowClean, cancelShadowClean, fetchJobSessions, fetchTrainees, type ShadowClean,
} from '@/lib/shadowCleans';

export default function JobShadowSection({
  job,
}: {
  job: { id: string; scheduled_date: string; status: string; cleaner_1_id: string | null; cleaner_2_id: string | null };
}) {
  const qc = useQueryClient();
  const [pick, setPick] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rating, setRating] = useState<ShadowClean | null>(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: sessions = [] } = useQuery({
    queryKey: ['shadow-cleans', 'job', job.id],
    queryFn: () => fetchJobSessions(job.id),
  });
  const canBook = !['cancelled', 'completed'].includes(job.status) && !!job.cleaner_1_id;
  const { data: trainees = [], isLoading: loadingTrainees } = useQuery({
    queryKey: ['shadow-trainees'],
    enabled: canBook,
    queryFn: fetchTrainees,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['shadow-cleans'] });
    qc.invalidateQueries({ queryKey: ['shadow-trainees'] });
    qc.invalidateQueries({ queryKey: ['shadow-suggestions'] });
    qc.invalidateQueries({ queryKey: ['staff-onboarding'] });
    qc.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
  };

  const live = sessions.filter(s => s.status !== 'cancelled');
  const onJob = new Set(live.map(s => s.trainee_id));
  const available = trainees.filter(t => t.id !== job.cleaner_1_id && t.id !== job.cleaner_2_id && !onJob.has(t.id));

  // Nothing to show on a finished or cancelled job that never had a shadow.
  if (!canBook && live.length === 0) return null;

  const book = async () => {
    if (!pick) return;
    setAdding(true);
    try {
      const t = trainees.find(x => x.id === pick);
      const { smsSent } = await addShadowClean(pick, job.id);
      toast.success(smsSent ? `${t?.name.split(' ')[0] || 'Trainee'} booked and texted the details.` : 'Booked. They have no mobile saved, so let them know yourself.');
      setPick('');
      refresh();
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setAdding(false);
    }
  };

  const cancel = async (s: ShadowClean) => {
    setBusy(s.id);
    try {
      await cancelShadowClean(s.id);
      toast.success('Shadow clean cancelled');
      refresh();
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground">
        <GraduationCap className="h-3.5 w-3.5" /> Shadow clean
      </label>

      {live.map(s => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{s.trainee_name || 'Trainee'}</p>
            <p className="text-xs text-muted-foreground">Shadowing {s.supervisor_name || 'Cleaner 1'}</p>
          </div>
          <SessionStatus s={s} />
          {(s.status === 'rated' || job.scheduled_date <= today) && (
            <button onClick={() => setRating(s)} className="flex h-8 items-center gap-1 rounded-lg border border-primary/40 px-2.5 text-xs font-bold text-primary hover:bg-primary/10">
              <Star className="h-3.5 w-3.5" /> {s.status === 'rated' ? 'Edit' : 'Rate'}
            </button>
          )}
          {s.status === 'scheduled' && (
            <button disabled={busy === s.id} onClick={() => cancel(s)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="Cancel shadow clean">
              {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          )}
        </div>
      ))}

      {canBook && (
        loadingTrainees ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : available.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {live.length ? 'No other trainees need a shadow clean.' : 'Nobody in training needs a shadow clean right now.'}
          </p>
        ) : (
          <div className="flex gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
              aria-label="Choose a trainee"
            >
              <option value="">Add a trainee to shadow…</option>
              {available.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.stepLabel}{t.scheduledCount ? ` · ${t.scheduledCount} booked` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={book}
              disabled={!pick || adding}
              className="flex h-10 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {adding && <Loader2 className="h-4 w-4 animate-spin" />} Book
            </button>
          </div>
        )
      )}
      {!job.cleaner_1_id && !['cancelled', 'completed'].includes(job.status) && (
        <p className="text-xs text-muted-foreground">Assign Cleaner 1 first. They supervise the shadow clean.</p>
      )}

      <ShadowCleanRatingDialog session={rating} open={!!rating} onOpenChange={(o) => !o && setRating(null)} onRated={refresh} />
    </div>
  );
}
