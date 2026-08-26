// Who works when.
//
// This is the screen that decides what clients can book. A cleaner is offered
// to clients only if they have hours here, so this is also the roster: give
// someone hours and they appear, remove their hours and they stop being
// offered. No roles involved.
//
// Two levels:
//   Normal week   the default pattern, eg Mon to Fri 7am to 4pm
//   Exceptions    a specific date that differs: off entirely, or shorter hours
//
// Admins can edit anyone. A cleaner opening this sees only themselves.

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CalendarOff, Clock, Check } from 'lucide-react';

const DAYS = [
  { i: 1, label: 'Monday' }, { i: 2, label: 'Tuesday' }, { i: 3, label: 'Wednesday' },
  { i: 4, label: 'Thursday' }, { i: 5, label: 'Friday' }, { i: 6, label: 'Saturday' },
  { i: 0, label: 'Sunday' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const pretty = (d: Date) =>
  d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

export default function AvailabilityPage() {
  const { user, role } = useAuth() as any;
  const qc = useQueryClient();
  const isAdmin = role === 'admin';
  const [who, setWho] = useState<string>('');

  // Everyone who could hold hours. Admins pick from this; a cleaner is locked
  // to themselves.
  const { data: people = [] } = useQuery({
    queryKey: ['availability-people'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
      return data || [];
    },
    enabled: isAdmin,
  });

  useEffect(() => { if (!who && user?.id) setWho(user.id); }, [user?.id, who]);

  const { data: week = [], isLoading: weekLoading } = useQuery({
    queryKey: ['weekly-availability', who],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('cleaner_weekly_availability')
        .select('id, weekday, start_time, end_time').eq('user_id', who);
      if (error) throw error;
      return data || [];
    },
    enabled: !!who,
  });

  const days = useMemo(
    () => Array.from({ length: 28 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }),
    [],
  );

  const { data: exceptions = [] } = useQuery({
    queryKey: ['availability-exceptions', who],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('cleaner_availability')
        .select('id, date, available, start_time, end_time')
        .eq('user_id', who).gte('date', iso(days[0])).lte('date', iso(days[days.length - 1]));
      if (error) throw error;
      return data || [];
    },
    enabled: !!who,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['weekly-availability', who] });
    qc.invalidateQueries({ queryKey: ['availability-exceptions', who] });
  };

  const setDay = async (weekday: number, start: string | null, end: string | null) => {
    const existing = week.find((w: any) => w.weekday === weekday);
    if (!start || !end) {
      if (existing) await (supabase as any).from('cleaner_weekly_availability').delete().eq('id', existing.id);
    } else if (existing) {
      await (supabase as any).from('cleaner_weekly_availability')
        .update({ start_time: start, end_time: end }).eq('id', existing.id);
    } else {
      await (supabase as any).from('cleaner_weekly_availability')
        .insert({ user_id: who, weekday, start_time: start, end_time: end });
    }
    refresh();
  };

  const setException = async (date: string, mode: 'default' | 'off' | 'custom', start?: string, end?: string) => {
    const existing = exceptions.find((e: any) => e.date === date);
    if (mode === 'default') {
      if (existing) await (supabase as any).from('cleaner_availability').delete().eq('id', existing.id);
    } else {
      const row = {
        user_id: who, date,
        available: mode === 'custom',
        start_time: mode === 'custom' ? (start || '07:00') : null,
        end_time:   mode === 'custom' ? (end   || '12:00') : null,
      };
      if (existing) await (supabase as any).from('cleaner_availability').update(row).eq('id', existing.id);
      else await (supabase as any).from('cleaner_availability').insert(row);
    }
    refresh();
    toast.success(mode === 'off' ? 'Marked unavailable' : mode === 'custom' ? 'Hours set' : 'Back to normal week');
  };

  const timeInput = 'rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground';

  if (!who || weekLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-black text-primary">Availability</h1>
        <p className="text-sm text-muted-foreground">
          Clients can only book times someone is available for. No hours means never offered.
        </p>
      </div>

      {isAdmin && people.length > 0 && (
        <select value={who} onChange={(e) => setWho(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 font-semibold text-foreground">
          {people.map((p: any) => <option key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</option>)}
        </select>
      )}

      {/* ── Normal week ── */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-black text-foreground">Normal week</h2>
          <p className="text-xs text-muted-foreground">The usual hours. Exceptions below override these.</p>
        </div>
        <div className="divide-y divide-border">
          {DAYS.map(d => {
            const row = week.find((w: any) => w.weekday === d.i);
            const on = !!row;
            return (
              <div key={d.i} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  onClick={() => on ? setDay(d.i, null, null) : setDay(d.i, '07:00', '16:00')}
                  className={`flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${on ? 'bg-primary' : 'bg-muted'}`}
                  aria-label={`${d.label} ${on ? 'on' : 'off'}`}
                >
                  <span className={`h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
                </button>
                <span className="w-24 font-bold text-foreground">{d.label}</span>
                {on ? (
                  <div className="flex items-center gap-2">
                    <input type="time" className={timeInput} value={String(row.start_time).slice(0, 5)}
                      onChange={(e) => setDay(d.i, e.target.value, String(row.end_time).slice(0, 5))} />
                    <span className="text-muted-foreground">to</span>
                    <input type="time" className={timeInput} value={String(row.end_time).slice(0, 5)}
                      onChange={(e) => setDay(d.i, String(row.start_time).slice(0, 5), e.target.value)} />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Not working</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Exceptions ── */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-black text-foreground">Next four weeks</h2>
          <p className="text-xs text-muted-foreground">
            Only change a day that differs from the normal week.
          </p>
        </div>
        <div className="max-h-[60vh] divide-y divide-border overflow-y-auto">
          {days.map(d => {
            const key = iso(d);
            const ex = exceptions.find((e: any) => e.date === key);
            const worksNormally = week.some((w: any) => w.weekday === d.getDay());
            const state: 'default' | 'off' | 'custom' = !ex ? 'default' : (ex.available ? 'custom' : 'off');
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="w-28 text-sm font-bold text-foreground">{pretty(d)}</span>

                {state === 'default' && (
                  <span className="flex-1 text-xs text-muted-foreground">
                    {worksNormally ? 'Normal hours' : 'Not a working day'}
                  </span>
                )}
                {state === 'off' && (
                  <span className="flex-1 text-xs font-bold text-destructive">Unavailable all day</span>
                )}
                {state === 'custom' && (
                  <div className="flex flex-1 items-center gap-2">
                    <input type="time" className={timeInput} value={String(ex.start_time || '07:00').slice(0, 5)}
                      onChange={(e) => setException(key, 'custom', e.target.value, String(ex.end_time || '12:00').slice(0, 5))} />
                    <span className="text-muted-foreground text-xs">to</span>
                    <input type="time" className={timeInput} value={String(ex.end_time || '12:00').slice(0, 5)}
                      onChange={(e) => setException(key, 'custom', String(ex.start_time || '07:00').slice(0, 5), e.target.value)} />
                  </div>
                )}

                <div className="flex gap-1">
                  <button onClick={() => setException(key, 'default')} title="Normal hours"
                    className={`rounded-lg border px-2 py-1.5 ${state === 'default' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setException(key, 'custom')} title="Only part of the day"
                    className={`rounded-lg border px-2 py-1.5 ${state === 'custom' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
                    <Clock className="h-4 w-4" />
                  </button>
                  <button onClick={() => setException(key, 'off')} title="Off all day"
                    className={`rounded-lg border px-2 py-1.5 ${state === 'off' ? 'border-destructive text-destructive' : 'border-border text-muted-foreground'}`}>
                    <CalendarOff className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
