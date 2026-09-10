// ============================================================================
// Shadow cleans for one trainee (Staff → trainee → Inductions).
//
// Shows what they still need, their booked and rated shadow cleans, and the
// best upcoming jobs to book next, one tap each.
// ============================================================================

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { GraduationCap, Loader2, Plus, Star, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ShadowCleanRatingDialog from '@/components/staff/ShadowCleanRatingDialog';
import {
  addShadowClean, cancelShadowClean, fetchSuggestedJobs, fetchTraineeSessions,
  OUTCOME_LABEL, shortDate, traineeNextStep, type ShadowClean,
} from '@/lib/shadowCleans';

export function SessionStatus({ s }: { s: ShadowClean }) {
  if (s.status === 'cancelled') {
    return <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">Cancelled</span>;
  }
  if (s.status === 'scheduled') {
    return <span className="rounded-full bg-[rgba(96,165,250,0.15)] px-2.5 py-1 text-[11px] font-bold text-[#60A5FA]">Booked</span>;
  }
  const tone = s.outcome === 'pass'
    ? 'bg-primary/10 text-primary'
    : s.outcome === 'fail' ? 'bg-destructive/10 text-destructive' : 'bg-amber-400/15 text-amber-400';
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>
      {s.rating}/10 · {s.outcome ? OUTCOME_LABEL[s.outcome] : ''}
    </span>
  );
}

export default function ShadowCleansPanel({ traineeId, traineeName }: { traineeId: string; traineeName: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState<ShadowClean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = format(new Date(), 'yyyy-MM-dd');

  // Same key and shape as StaffOnboardingSection, so both share one cache entry.
  const { data: onboarding, isLoading: loadingOnboarding } = useQuery({
    queryKey: ['staff-onboarding', traineeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_onboarding').select('*').eq('user_id', traineeId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['shadow-cleans', 'trainee', traineeId],
    queryFn: () => fetchTraineeSessions(traineeId),
  });
  const approved = Boolean(onboarding?.director_approved);
  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery({
    queryKey: ['shadow-suggestions', traineeId],
    enabled: !!onboarding && !approved,
    queryFn: () => fetchSuggestedJobs(traineeId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['shadow-cleans'] });
    qc.invalidateQueries({ queryKey: ['shadow-suggestions'] });
    qc.invalidateQueries({ queryKey: ['shadow-trainees'] });
    qc.invalidateQueries({ queryKey: ['staff-onboarding', traineeId] });
    qc.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
  };

  const book = async (jobId: string) => {
    setBusy(jobId);
    try {
      const { smsSent } = await addShadowClean(traineeId, jobId);
      toast.success(smsSent ? `Booked. ${traineeName.split(' ')[0]} has been texted the details.` : 'Booked. They have no mobile saved, so let them know yourself.');
      refresh();
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setBusy(null);
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

  if (loadingOnboarding) return null;

  const next = traineeNextStep(onboarding?.training_record);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><GraduationCap className="h-5 w-5 text-primary" />Shadow cleans</h2>
          <p className="mt-1 text-sm text-muted-foreground">Book {traineeName.split(' ')[0]} onto a real clean, then rate it. Ratings fill the training record below.</p>
        </div>
        {onboarding && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${next.step === 'done' || approved ? 'bg-primary/10 text-primary' : 'bg-amber-400/15 text-amber-400'}`}>
            {approved ? 'Approved for deployment' : next.label}
          </span>
        )}
      </div>

      {!onboarding ? (
        <p className="mt-4 text-sm text-muted-foreground">No onboarding record yet, so shadow cleans can't be booked. Invite them from Staff first.</p>
      ) : (
        <>
          {/* Booked and rated */}
          <div className="mt-4 space-y-2">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">None booked yet.</p>
            ) : (
              sessions.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.property_name || 'Clean'}</p>
                    <p className="text-xs text-muted-foreground">{shortDate(s.scheduled_date, s.scheduled_time)} · with {s.supervisor_name || 'supervisor'}</p>
                    {s.status === 'rated' && s.notes && <p className="mt-1 text-xs text-foreground/80">"{s.notes}"</p>}
                  </div>
                  <SessionStatus s={s} />
                  {s.status !== 'cancelled' && (
                    <div className="flex shrink-0 gap-1">
                      {(s.status === 'rated' || s.scheduled_date <= today) && (
                        <button onClick={() => setRating(s)} className="flex h-9 items-center gap-1 rounded-lg border border-primary/40 px-3 text-xs font-bold text-primary hover:bg-primary/10">
                          <Star className="h-3.5 w-3.5" /> {s.status === 'rated' ? 'Edit rating' : 'Rate'}
                        </button>
                      )}
                      {s.status === 'scheduled' && (
                        <button disabled={busy === s.id} onClick={() => cancel(s)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="Cancel shadow clean">
                          {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Smart suggestions */}
          {!approved && next.step !== 'done' && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Suggested jobs to shadow · next 3 weeks</p>
              {loadingSuggestions ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming jobs run by an admin or head cleaner in the next 3 weeks. Assign one on the Schedule, then book it from the job.</p>
              ) : (
                <div className="space-y-2">
                  {suggestions.map(j => (
                    <div key={j.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {j.property_name}
                          {j.client_type === 'airbnb' && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Airbnb</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{shortDate(j.scheduled_date, j.scheduled_time)}{j.suburb ? ` · ${j.suburb}` : ''} · with {j.supervisor_name}</p>
                      </div>
                      <button disabled={!!busy} onClick={() => book(j.id)} className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground disabled:opacity-50">
                        {busy === j.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Book
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ShadowCleanRatingDialog session={rating} open={!!rating} onOpenChange={(o) => !o && setRating(null)} onRated={refresh} />
    </section>
  );
}
