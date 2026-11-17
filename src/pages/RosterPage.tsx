// ============================================================================
// The roster behind a cleaner's standing link.  /roster/:token
//
// BJ, 17 Nov 2026: "i want a roster i can send everybody ... whenever i update
// the schedual the roster needs to update ... cleaners have to accept the jobs
// as they come in or decline ... it needs to be consistanly updated live as i
// change the scheduel"
//
// One link per person, sent once, never reissued. Two views of the same week
// (list and calendar) because a glance at a month and a plan for a week are
// different questions. Only their own jobs carry buttons.
//
// WHY POLLING AND NOT REALTIME: this page has no login, so a Realtime channel
// would have to be readable by `anon` on `jobs` and `job_acceptances`. That
// means leaning on the blanket RLS policies that are on the list to be closed,
// and the roster would silently stop updating the day they are. A 30s poll
// while the tab is visible, plus an immediate refetch when it regains focus,
// gives BJ the behaviour he asked for and survives the lockdown.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabasePublic } from '@/integrations/supabase/client';

type Answer = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

interface TeamMember {
  id: string;
  name: string;
  answer: Answer | null;
}

interface RosterJob {
  id: string;
  date: string;
  time: string;
  minutes: number | null;
  status: string;
  property: string;
  suburb: string | null;
  back_to_back: boolean;
  owner_stay: boolean;
  team: TeamMember[];
  mine: boolean;
  my_answer: Answer | null;
  answer_by: string | null;
  overdue: boolean;
  unfilled: boolean;
}

interface RosterPayload {
  ok: true;
  viewer: { id: string; name: string; sees_everyone: boolean };
  from: string;
  to: string;
  today: string;
  jobs: RosterJob[];
}

const GREEN = '#4ADE80';
const AMBER = '#FCD34D';
const RED = '#F87171';

// ---------------------------------------------------------------- date helpers
// All plain-date arithmetic, done in UTC so it can never drift by a day.

function toDate(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}
function addDays(d: string, n: number): string {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function mondayOf(d: string): string {
  const x = toDate(d);
  const dow = x.getUTCDay();
  return addDays(d, -(dow === 0 ? 6 : dow - 1));
}
function monthOf(d: string): string {
  return d.slice(0, 7);
}
function addMonths(ym: string, n: number): string {
  const x = new Date(`${ym}-01T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 7);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function dayLabel(d: string): string {
  const x = toDate(d);
  return `${DAY_NAMES[x.getUTCDay()]} ${x.getUTCDate()} ${MONTH_NAMES[x.getUTCMonth()].slice(0, 3)}`;
}
function rangeLabel(from: string, to: string): string {
  const a = toDate(from);
  const b = toDate(to);
  const am = MONTH_NAMES[a.getUTCMonth()].slice(0, 3);
  const bm = MONTH_NAMES[b.getUTCMonth()].slice(0, 3);
  return am === bm
    ? `${a.getUTCDate()} to ${b.getUTCDate()} ${bm}`
    : `${a.getUTCDate()} ${am} to ${b.getUTCDate()} ${bm}`;
}

/**
 * "09:00 – 10:30". BJ, 17 Nov: "put the start time and end time on each one" —
 * a cleaner planning a day needs to know when they get their car back, which a
 * duration alone makes them work out in their head for every job.
 */
function timeRange(start: string, mins: number | null): string {
  if (!/^\d{1,2}:\d{2}$/.test(start)) return start;
  if (!mins || mins <= 0) return start;
  const [h, m] = start.split(':').map(Number);
  const end = h * 60 + m + mins;
  const eh = Math.floor(end / 60) % 24;
  const em = end % 60;
  return `${start} – ${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function durationLabel(mins: number | null): string {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} hr ${m}`;
  if (h) return `${h} hr`;
  return `${m} min`;
}

/** "by Sat 9:45pm" — the 12-hour deadline, in the reader's own clock. */
function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  const day = DAY_NAMES[d.getDay()];
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${day} ${h}:${String(m).padStart(2, '0')}${ampm}`;
}

// ------------------------------------------------------------------- the page

export default function RosterPage() {
  const { token } = useParams<{ token: string }>();

  const [view, setView] = useState<'week' | 'calendar'>('week');
  const [weekOf, setWeekOf] = useState<string>(() => mondayOf(new Date().toISOString().slice(0, 10)));
  const [monthCursor, setMonthCursor] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [data, setData] = useState<RosterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Keeps the poll from fighting a fetch the reader just triggered.
  const inFlight = useRef(false);

  const load = useCallback(async (opts: { quiet?: boolean } = {}) => {
    if (!token) { setError('This link is not valid.'); setLoading(false); return; }
    if (inFlight.current) return;
    inFlight.current = true;
    if (!opts.quiet) setLoading(true);
    try {
      const body = view === 'calendar'
        ? { token, month_of: monthCursor }
        : { token, week_of: weekOf };
      const { data: res, error: err } = await supabasePublic.functions.invoke('roster-data', { body });
      if (err) {
        // invoke() throws the body away on a non-2xx, so dig the real message
        // out of the response rather than showing "Edge Function failed".
        let msg = 'Could not load your roster.';
        const ctx = (err as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try { msg = (await ctx.json())?.error ?? msg; } catch { /* keep default */ }
        }
        setError(msg);
        setData(null);
      } else {
        setError(null);
        setData(res as RosterPayload);
      }
    } catch {
      setError('Could not reach the roster. Check your signal and try again.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [token, view, weekOf, monthCursor]);

  useEffect(() => { void load(); }, [load]);

  // Live-ish: poll while the tab is actually being looked at, and refetch the
  // moment it comes back. A backgrounded phone costs nothing.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load({ quiet: true }); };
    const id = window.setInterval(tick, 30_000);
    const onWake = () => { if (document.visibilityState === 'visible') void load({ quiet: true }); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [load]);

  const answer = useCallback(async (jobId: string, ans: 'accept' | 'decline' | 'withdraw') => {
    if (!token) return;
    setBusyJob(jobId);
    try {
      const { data: res, error: err } = await supabasePublic.functions.invoke('roster-respond', {
        body: { token, job_id: jobId, answer: ans },
      });
      if (err) {
        let msg = 'That did not go through. Try again.';
        const ctx = (err as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try { msg = (await ctx.json())?.error ?? msg; } catch { /* keep default */ }
        }
        setToast(msg);
      } else {
        setToast((res as { message?: string })?.message
          ?? (ans === 'accept' ? 'Accepted. Thanks.' : ans === 'decline' ? 'Declined. The office has been told.' : 'Handed back. The office has been told.'));
      }
    } catch {
      setToast('That did not go through. Try again.');
    } finally {
      setBusyJob(null);
      // Always refetch: the truth is on the server, not in what we just sent.
      await load({ quiet: true });
    }
  }, [token, load]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const jobs = data?.jobs ?? [];

  const mineNeedingAnswer = useMemo(
    () => jobs.filter((j) =>
      j.mine && j.my_answer === 'pending'
      && j.date >= (data?.today ?? '')
      && j.status !== 'completed' && j.status !== 'cancelled'),
    [jobs, data?.today],
  );

  const stats = useMemo(() => {
    const mine = jobs.filter((j) => j.mine && j.status !== 'cancelled');
    const minutes = mine.reduce((sum, j) => sum + (j.minutes ?? 0), 0);
    return {
      cleans: mine.length,
      hours: Math.round((minutes / 60) * 10) / 10,
      toAnswer: mineNeedingAnswer.length,
    };
  }, [jobs, mineNeedingAnswer]);

  const byDay = useMemo(() => {
    const m = new Map<string, RosterJob[]>();
    for (const j of jobs) {
      if (!m.has(j.date)) m.set(j.date, []);
      m.get(j.date)!.push(j);
    }
    for (const list of m.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return m;
  }, [jobs]);

  // ------------------------------------------------------------------ chrome

  const shell = (inner: React.ReactNode) => (
    <div style={{ minHeight: '100dvh', background: '#0B1F17', color: '#F0FDF4' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 48 }}>{inner}</div>
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 20, margin: '0 auto', maxWidth: 420,
            background: '#123024', border: `1px solid ${GREEN}55`, borderRadius: 14,
            padding: '12px 14px', fontSize: 13, fontWeight: 700, textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,.45)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );

  if (loading && !data) {
    return shell(
      <div style={{ padding: '80px 20px', textAlign: 'center', opacity: 0.7, fontSize: 14 }}>
        Loading your roster…
      </div>,
    );
  }

  if (error && !data) {
    return shell(
      <div style={{ padding: '72px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: GREEN, margin: 0 }}>
          Brightly
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '14px 0 8px', color: '#F0FDF4' }}>Roster unavailable</h1>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(240,253,244,.72)', margin: 0 }}>{error}</p>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(240,253,244,.5)', marginTop: 18 }}>
          If you think it should work, text the office and we will send you a new link.
        </p>
      </div>,
    );
  }

  if (!data) return shell(null);

  const isAdminView = data.viewer.sees_everyone;

  return shell(
    <>
      {/* Header */}
      <div style={{ padding: '22px 18px 14px', background: '#123024', borderBottom: `1px solid ${GREEN}2E` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: GREEN }}>
              Brightly
            </p>
            <h1 style={{ margin: '4px 0 0', fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', color: '#F0FDF4' }}>
              {isAdminView ? 'The roster' : view === 'calendar' ? 'My month' : 'My week'}
            </h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>{data.viewer.name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 600, color: 'rgba(240,253,244,.55)' }}>
              {isAdminView ? 'Everyone' : 'Cleaner'}
            </p>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ marginTop: 14, display: 'flex', gap: 4, background: 'rgba(240,253,244,.07)', borderRadius: 11, padding: 4 }}>
          {(['week', 'calendar'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setView(v); setSelectedDay(null); }}
              style={{
                flex: 1, minHeight: 38, borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: view === v ? 900 : 800,
                background: view === v ? GREEN : 'transparent',
                color: view === v ? '#06231A' : 'rgba(240,253,244,.65)',
              }}
            >
              {v === 'week' ? 'Week' : 'Calendar'}
            </button>
          ))}
        </div>

        {/* Period nav */}
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            aria-label={view === 'week' ? 'Previous week' : 'Previous month'}
            onClick={() => view === 'week' ? setWeekOf(addDays(weekOf, -7)) : setMonthCursor(addMonths(monthCursor, -1))}
            style={navBtn}
          >
            ‹
          </button>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
            {view === 'week'
              ? rangeLabel(data.from, data.to)
              : `${MONTH_NAMES[Number(monthCursor.slice(5, 7)) - 1]} ${monthCursor.slice(0, 4)}`}
          </p>
          <button
            type="button"
            aria-label={view === 'week' ? 'Next week' : 'Next month'}
            onClick={() => view === 'week' ? setWeekOf(addDays(weekOf, 7)) : setMonthCursor(addMonths(monthCursor, 1))}
            style={navBtn}
          >
            ›
          </button>
        </div>

        {/* Summary strip — only meaningful for someone reading their own week */}
        {!isAdminView && view === 'week' && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Stat value={String(stats.cleans)} label="cleans" />
            <Stat value={String(stats.hours)} label="hours" />
            <Stat value={String(stats.toAnswer)} label="to answer" accent={stats.toAnswer > 0} />
          </div>
        )}
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        {view === 'calendar' ? (
          <CalendarView
            monthCursor={monthCursor}
            byDay={byDay}
            today={data.today}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        ) : null}

        {/* Needs an answer, lifted to the top: it is the only part that is a task */}
        {mineNeedingAnswer.length > 0 && view === 'week' && (
          <>
            <SectionLabel colour={AMBER}>Needs your answer</SectionLabel>
            {Array.from(new Set(mineNeedingAnswer.map((j) => j.date))).sort().map((d) => {
              const forDay = mineNeedingAnswer.filter((j) => j.date === d);
              return (
                <div key={`todo-${d}`}>
                  <DayHeading date={d} jobs={forDay} isToday={d === data.today} tone={AMBER} />
                  {forDay.map((j) => (
                    <JobCard key={`todo-${j.id}`} job={j} meId={data.viewer.id} today={data.today} busy={busyJob === j.id} onAnswer={answer} />
                  ))}
                </div>
              );
            })}
          </>
        )}

        {/* The week, or the selected calendar day */}
        {view === 'week' ? (
          <WeekList
            from={data.from}
            meId={data.viewer.id}
            byDay={byDay}
            today={data.today}
            skipIds={new Set(mineNeedingAnswer.map((j) => j.id))}
            busyJob={busyJob}
            onAnswer={answer}
          />
        ) : (
          selectedDay && (
            <>
              <SectionLabel>{dayLabel(selectedDay)}</SectionLabel>
              {(byDay.get(selectedDay) ?? []).length === 0 ? (
                <Empty>Nothing on this day.</Empty>
              ) : (
                (byDay.get(selectedDay) ?? []).map((j) => (
                  <JobCard key={j.id} job={j} meId={data.viewer.id} today={data.today} busy={busyJob === j.id} onAnswer={answer} />
                ))
              )}
            </>
          )
        )}

        <p style={{ margin: '24px 0 0', fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'rgba(240,253,244,.38)', lineHeight: 1.55 }}>
          This page updates on its own.<br />No need to refresh or ask for a new link.
        </p>
      </div>
    </>,
  );
}

const navBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(240,253,244,.18)',
  background: 'transparent', color: '#F0FDF4', fontSize: 15, fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
};

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  const c = accent ? '#FEDB00' : GREEN;
  return (
    <div style={{
      flex: 1, background: accent ? 'rgba(254,219,0,.12)' : 'rgba(74,222,128,.10)',
      border: `1px solid ${accent ? 'rgba(254,219,0,.42)' : 'rgba(74,222,128,.25)'}`,
      borderRadius: 12, padding: '9px 10px',
    }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: c }}>{value}</p>
      <p style={{ margin: '1px 0 0', fontSize: 10, fontWeight: 700, color: 'rgba(240,253,244,.65)' }}>{label}</p>
    </div>
  );
}

function SectionLabel({ children, colour }: { children: React.ReactNode; colour?: string }) {
  return (
    <p style={{
      margin: '18px 0 8px', fontSize: 11, fontWeight: 900, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: colour ?? 'rgba(240,253,244,.45)',
    }}>
      {children}
    </p>
  );
}

// BJ, 17 Nov: "its all togther ... make a break for each day ... visually
// seperate so it is crystal clear." A label alone was not reading as a break,
// so each day gets a rule across the page and its own total — which also
// answers the question a cleaner actually has when they look at a day, which
// is "how long am I out for".
function DayHeading({
  date, jobs, isToday, tone,
}: {
  date: string;
  jobs: RosterJob[];
  isToday: boolean;
  tone?: string;
}) {
  const live = jobs.filter((j) => j.status !== 'cancelled');
  const mins = live.reduce((sum, j) => sum + (j.minutes ?? 0), 0);
  const summary = [
    live.length ? `${live.length} clean${live.length > 1 ? 's' : ''}` : '',
    mins ? durationLabel(mins) : '',
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '26px 0 10px' }}>
      <span style={{
        fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: tone ?? (isToday ? GREEN : '#F0FDF4'), whiteSpace: 'nowrap',
      }}>
        {dayLabel(date)}{isToday ? ' · today' : ''}
      </span>
      <span style={{ flex: 1, height: 1, background: 'rgba(240,253,244,.16)' }} />
      {summary && (
        <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(240,253,244,.45)', whiteSpace: 'nowrap' }}>
          {summary}
        </span>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(240,253,244,.45)', fontWeight: 600 }}>
      {children}
    </p>
  );
}

// ------------------------------------------------------------------ week list

function WeekList({
  from, meId, byDay, today, skipIds, busyJob, onAnswer,
}: {
  from: string;
  meId: string;
  byDay: Map<string, RosterJob[]>;
  today: string;
  skipIds: Set<string>;
  busyJob: string | null;
  onAnswer: (id: string, a: 'accept' | 'decline' | 'withdraw') => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const anything = days.some((d) => (byDay.get(d) ?? []).length > 0);

  if (!anything) {
    return (
      <div style={{ padding: '40px 4px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Nothing on this week.</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(240,253,244,.5)' }}>
          New cleans show up here as soon as the office books them.
        </p>
      </div>
    );
  }

  return (
    <>
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={d}>
            <DayHeading date={d} jobs={list} isToday={d === today} />
            {list.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                meId={meId}
                today={today}
                dimmed={skipIds.has(j.id)}
                busy={busyJob === j.id}
                onAnswer={onAnswer}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

// -------------------------------------------------------------------- one job

function JobCard({
  job, meId, today, dimmed = false, busy, onAnswer,
}: {
  job: RosterJob;
  meId: string;
  today: string;
  dimmed?: boolean;
  busy: boolean;
  onAnswer: (id: string, a: 'accept' | 'decline' | 'withdraw') => void;
}) {
  const needsAnswer = job.mine && job.my_answer === 'pending' && job.date >= today
    && job.status !== 'completed' && job.status !== 'cancelled';
  const accepted = job.mine && job.my_answer === 'accepted';
  const declined = job.mine && (job.my_answer === 'declined' || job.my_answer === 'withdrawn');
  const done = job.status === 'completed';
  const cancelled = job.status === 'cancelled';

  // A card the reader has already dealt with and is only seeing again in the
  // day list: show it quietly, without a second set of buttons.
  const border = needsAnswer && !dimmed ? 'rgba(254,219,0,.55)'
    : declined ? `${RED}66`
    : job.owner_stay ? 'rgba(168,85,247,.38)'
    : `${GREEN}38`;

  const stripe = job.back_to_back
    ? `repeating-linear-gradient(135deg, #FF2D55 0 6px, #B3001F 6px 12px)`
    : job.owner_stay
      ? `repeating-linear-gradient(135deg, #C084FC 0 6px, #7E22CE 6px 12px)`
      : null;

  return (
    <div style={{
      position: 'relative', background: needsAnswer && !dimmed ? '#1A2E24' : '#14241D',
      border: `1px solid ${border}`,
      borderLeft: accepted ? `3px solid ${GREEN}` : undefined,
      borderRadius: 14, padding: '12px 13px', marginBottom: 8, overflow: 'hidden',
      opacity: cancelled ? 0.45 : 1,
    }}>
      {stripe && <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 7, background: stripe }} />}

      <div style={{ paddingRight: stripe ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 900, minWidth: 0 }}>{job.property}</p>
          <StatusPill job={job} />
        </div>

        <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 800, color: '#F0FDF4', letterSpacing: '-0.01em' }}>
          {timeRange(job.time, job.minutes)}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: 'rgba(240,253,244,.6)' }}>
          {[durationLabel(job.minutes), job.suburb].filter(Boolean).join(' · ')}
        </p>

        {job.back_to_back && (
          <p style={{ margin: '7px 0 0', fontSize: 11, fontWeight: 800, color: '#FF6B81' }}>
            ⚡ Back to back — a guest checks in the same day
          </p>
        )}
        {job.owner_stay && (
          <p style={{ margin: '5px 0 0', fontSize: 11, fontWeight: 800, color: '#D8B4FE' }}>
            👑 Owner arriving — extra detail on this one
          </p>
        )}

        <TeamLine job={job} meId={meId} />

        {job.unfilled && (
          <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 800, color: '#FEDB00' }}>
            Nobody on this clean yet
          </p>
        )}

        {needsAnswer && job.answer_by && (
          <p style={{
            margin: '9px 0 0', fontSize: 11, fontWeight: 700,
            color: job.overdue ? RED : 'rgba(240,253,244,.5)',
          }}>
            {job.overdue ? 'Overdue — please answer now' : `Answer by ${deadlineLabel(job.answer_by)}`}
          </p>
        )}

        {/* Buttons, only on your own job, and only while there is a choice */}
        {needsAnswer && !dimmed && !done && !cancelled && (
          <div style={{ marginTop: 11, display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => onAnswer(job.id, 'accept')} style={btnPrimary(busy)}>
              {busy ? '…' : 'Accept'}
            </button>
            <button type="button" disabled={busy} onClick={() => onAnswer(job.id, 'decline')} style={btnGhost(busy)}>
              Decline
            </button>
          </div>
        )}

        {accepted && !done && !cancelled && (
          <div style={{ marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => onAnswer(job.id, 'withdraw')} style={btnQuiet(busy)}>
              {busy ? '…' : 'I can no longer do this'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ job }: { job: RosterJob }) {
  let text: string;
  let colour: string;
  if (job.status === 'cancelled') { text = 'CANCELLED'; colour = 'rgba(240,253,244,.5)'; }
  else if (job.status === 'completed') { text = 'DONE'; colour = GREEN; }
  else if (!job.mine) { text = ''; colour = GREEN; }
  else if (job.my_answer === 'accepted') { text = 'ACCEPTED'; colour = GREEN; }
  else if (job.my_answer === 'declined') { text = 'DECLINED'; colour = RED; }
  else if (job.my_answer === 'withdrawn') { text = 'HANDED BACK'; colour = RED; }
  else if (job.my_answer === 'pending') { text = 'TO ANSWER'; colour = '#FEDB00'; }
  else { text = ''; colour = GREEN; }

  if (!text) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 900, color: colour, whiteSpace: 'nowrap',
      background: 'rgba(240,253,244,.08)', borderRadius: 999, padding: '3px 8px',
    }}>
      {text}
    </span>
  );
}

/** "With Jess — accepted" / "Lucy no reply yet". The words behind the colours. */
function TeamLine({ job, meId }: { job: RosterJob; meId: string }) {
  // On your own job the useful thing is whether the OTHER person has answered,
  // so a solo clean says nothing. On someone else's job it is simply who is on
  // it, which is the whole point of the admin view.
  const shown = job.mine ? job.team.filter((t) => t.id !== meId) : job.team;
  if (shown.length === 0) return null;

  const word = (a: Answer | null) =>
    a === 'accepted' ? 'accepted'
    : a === 'declined' ? 'declined'
    : a === 'withdrawn' ? 'handed back'
    : a === 'pending' ? 'no reply yet'
    : 'not offered yet';

  const colour = (a: Answer | null) =>
    a === 'accepted' ? GREEN
    : a === 'declined' || a === 'withdrawn' ? RED
    : a === 'pending' ? AMBER
    : 'rgba(240,253,244,.5)';

  return (
    <p style={{ margin: '7px 0 0', fontSize: 11, fontWeight: 700, color: 'rgba(240,253,244,.5)' }}>
      {job.mine ? 'With ' : ''}
      {shown.map((t, i) => (
        <span key={t.id}>
          {i > 0 && <span style={{ opacity: 0.5 }}> · </span>}
          <span style={{ color: 'rgba(240,253,244,.8)' }}>{t.name.split(' ')[0]}</span>
          {' '}
          <span style={{ color: colour(t.answer) }}>{word(t.answer)}</span>
        </span>
      ))}
    </p>
  );
}

function btnPrimary(busy: boolean): React.CSSProperties {
  return {
    flex: 2, minHeight: 44, border: 'none', borderRadius: 11, background: GREEN,
    color: '#06231A', fontFamily: 'inherit', fontSize: 14, fontWeight: 900,
    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
  };
}
function btnGhost(busy: boolean): React.CSSProperties {
  return {
    flex: 1, minHeight: 44, border: '1px solid rgba(240,253,244,.28)', borderRadius: 11,
    background: 'transparent', color: 'rgba(240,253,244,.8)', fontFamily: 'inherit',
    fontSize: 14, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
  };
}
function btnQuiet(busy: boolean): React.CSSProperties {
  return {
    minHeight: 36, padding: '0 12px', border: '1px solid rgba(248,113,113,.4)', borderRadius: 10,
    background: 'transparent', color: '#FCA5A5', fontFamily: 'inherit', fontSize: 12,
    fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
  };
}

// --------------------------------------------------------------- calendar view

function CalendarView({
  monthCursor, byDay, today, selectedDay, onSelectDay,
}: {
  monthCursor: string;
  byDay: Map<string, RosterJob[]>;
  today: string;
  selectedDay: string | null;
  onSelectDay: (d: string) => void;
}) {
  const first = `${monthCursor}-01`;
  const firstDow = toDate(first).getUTCDay();           // 0 Sun .. 6 Sat
  const blanks = firstDow === 0 ? 6 : firstDow - 1;     // weeks start Monday
  const daysInMonth = new Date(
    Number(monthCursor.slice(0, 4)),
    Number(monthCursor.slice(5, 7)),
    0,
  ).getDate();

  const dotFor = (j: RosterJob): string => {
    if (j.status === 'cancelled') return 'rgba(240,253,244,.25)';
    // A clean that has already happened can no longer be answered, so it
    // never shows as an outstanding task however the acceptance row was left.
    const past = j.date < today || j.status === 'completed';
    if (j.mine && j.my_answer === 'pending' && !past) return '#FEDB00';
    if (j.mine && (j.my_answer === 'declined' || j.my_answer === 'withdrawn')) return RED;
    if (j.back_to_back) return '#FF6B81';
    return GREEN;
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4, marginBottom: 6 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <p key={i} style={{
            margin: 0, textAlign: 'center', fontSize: 10, fontWeight: 900,
            color: i >= 5 ? GREEN : 'rgba(240,253,244,.4)',
          }}>
            {d}
          </p>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4 }}>
        {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} style={{ minHeight: 46 }} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const n = i + 1;
          const date = `${monthCursor}-${String(n).padStart(2, '0')}`;
          const list = byDay.get(date) ?? [];
          const isToday = date === today;
          const isSel = date === selectedDay;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay(date)}
              aria-label={`${n} ${MONTH_NAMES[Number(monthCursor.slice(5, 7)) - 1]}, ${list.length === 0 ? 'no cleans' : `${list.length} clean${list.length > 1 ? 's' : ''}`}`}
              style={{
                minHeight: 46, borderRadius: 10, cursor: 'pointer', display: 'block',
                padding: '5px 2px', color: 'inherit', fontFamily: 'inherit',
                background: isSel ? 'rgba(74,222,128,.14)' : 'rgba(240,253,244,.03)',
                border: `1px solid ${isSel ? GREEN : isToday ? 'rgba(240,253,244,.4)' : 'rgba(240,253,244,.10)'}`,
              }}
            >
              <span style={{
                display: 'block', textAlign: 'center', fontSize: 13,
                fontWeight: list.length ? 900 : 600,
                color: list.length ? '#F0FDF4' : 'rgba(240,253,244,.45)',
              }}>
                {n}
              </span>
              <span style={{ display: 'flex', gap: 2, justifyContent: 'center', minHeight: 5, marginTop: 3 }}>
                {list.slice(0, 4).map((j) => (
                  <span key={j.id} style={{ width: 5, height: 5, borderRadius: 999, background: dotFor(j) }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{
        marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: '10px 14px',
        padding: '11px 12px', background: 'rgba(240,253,244,.05)', borderRadius: 12,
      }}>
        {[['Accepted', GREEN], ['Needs an answer', '#FEDB00'], ['Back to back', '#FF6B81'], ['Declined', RED]].map(([label, c]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'rgba(240,253,244,.75)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: c as string, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

      {!selectedDay && (
        <p style={{ margin: '16px 0 0', fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'rgba(240,253,244,.38)' }}>
          Tap any day to see what is on it.
        </p>
      )}
    </>
  );
}
