// Real available times, not a free-text time field.
//
// The old booking form let a client type any time they liked, defaulting to
// 11:00, and nothing ever checked whether anyone was free. That is how a clean
// got booked for an afternoon Jess was already working.
//
// Every time shown here has been checked against the cleaners' hours, the jobs
// already in the calendar, and travel time either side. If a time is on screen,
// somebody can actually do it.

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CalendarX } from 'lucide-react';

interface Props {
  date: string;                  // yyyy-mm-dd
  durationMinutes: number;
  value: string;                 // HH:MM
  onChange: (time: string) => void;
  /** Told when a day has nothing free, so the parent can block submission. */
  onAvailabilityChange?: (hasSlots: boolean) => void;
}

const pretty = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`;
};

export default function SlotPicker({ date, durationMinutes, value, onChange, onAvailabilityChange }: Props) {
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) { setSlots([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: err } = await (supabase as any).rpc('get_available_slots', {
        p_date: date,
        p_duration_minutes: durationMinutes,
      });
      if (cancelled) return;
      setLoading(false);

      if (err) {
        // Fail visibly. Silently falling back to "any time is fine" is exactly
        // how the double booking happened in the first place.
        console.error('get_available_slots failed:', err);
        setError("We couldn't load available times. Give us a call on 0418 878 707 and we'll sort it.");
        setSlots([]);
        onAvailabilityChange?.(false);
        return;
      }

      const times = (data || []).map((r: any) => String(r.slot).slice(0, 5));
      setSlots(times);
      onAvailabilityChange?.(times.length > 0);
      // If what they had chosen is no longer free, clear it rather than
      // letting them submit a time nobody can do.
      if (value && !times.includes(value)) onChange('');
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, durationMinutes]);

  if (!date) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking what's free...
      </div>
    );
  }

  if (error) {
    return <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{error}</p>;
  }

  if (!slots.length) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-center">
        <CalendarX className="mx-auto mb-2 h-5 w-5 text-white/40" />
        <p className="text-sm font-semibold text-white/80">Nothing free that day</p>
        <p className="mt-1 text-xs text-white/50">Try another date, we fill up fast.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map(t => {
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              className={`rounded-xl border py-2.5 text-sm font-bold transition-colors ${
                active
                  ? 'border-[#4ADE80] bg-[#4ADE80] text-black'
                  : 'border-white/15 bg-white/5 text-white/80 hover:border-[#4ADE80]/60'
              }`}
            >
              {pretty(t)}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-white/45">
        These are the times we can actually get to you, allowing travel between jobs.
      </p>
    </div>
  );
}
