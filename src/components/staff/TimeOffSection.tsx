// ============================================================================
// Book time off for a cleaner (Availability page).
//
// A stretch of dates here makes them unavailable, so scheduling refuses to put
// them on a job on those days unless an admin overrides it. Jobs already on
// their name during the time off are called out, since someone has to cover.
// ============================================================================

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarOff, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { addTimeOff, fetchTimeOff, removeTimeOff, timeOffLabel } from '@/lib/timeOff';

export default function TimeOffSection({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: all = [], isLoading } = useQuery({
    queryKey: ['time-off', 'all'],
    queryFn: () => fetchTimeOff(180),
  });
  const mine = all.filter((l) => l.user_id === userId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['time-off'] });
    qc.invalidateQueries({ queryKey: ['time-off-bar'] });
  };

  const save = async () => {
    if (!start) { toast.error('Pick the first day off.'); return; }
    const last = end || start;
    if (last < start) { toast.error('The last day is before the first day.'); return; }
    setSaving(true);
    try {
      await addTimeOff(userId, start, last, reason.trim());
      toast.success(start === last ? 'Time off booked' : 'Time off booked');
      setStart(''); setEnd(''); setReason('');
      refresh();
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await removeTimeOff(id);
      toast.success('Time off removed');
      refresh();
    } catch (e: any) {
      toast.error(e.message, { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  const field = 'rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground';

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-black text-foreground">
          <CalendarOff className="h-4 w-4 text-primary" /> Time off
        </h2>
        <p className="text-xs text-muted-foreground">
          Holidays and days away. Nobody can be put on a job while they are off, and it shows at the top of every page.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
          <label className="text-xs font-bold text-muted-foreground">
            First day
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`mt-1 block ${field}`} />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            Last day
            <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={`mt-1 block ${field}`} />
          </label>
          <label className="min-w-[8rem] flex-1 text-xs font-bold text-muted-foreground">
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Holiday" className={`mt-1 block w-full ${field}`} />
          </label>
          <button
            onClick={save}
            disabled={saving || !start}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Book time off
          </button>
          <p className="w-full text-xs text-muted-foreground">One day off: fill in the first day only.</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : mine.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No time off booked.</p>
      ) : (
        <div className="divide-y divide-border">
          {mine.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{timeOffLabel(l)}</p>
                <p className="text-xs text-muted-foreground">
                  {l.reason || 'Time off'}
                  {' · back '}
                  {format(new Date(l.end_date + 'T00:00:00'), 'EEE d MMM')}
                </p>
                {l.clashingJobs > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {l.clashingJobs} {l.clashingJobs === 1 ? 'job is' : 'jobs are'} still on them during this. Reassign on the Schedule.
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(l.id)}
                  disabled={busy === l.id}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
                  aria-label="Remove time off"
                >
                  {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
